import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAddress } from "viem";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/rate-limit";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function generateShortCode() {
    return crypto.randomBytes(4).toString("hex"); // e.g., "a1b2c3d4"
}

export async function POST(req: NextRequest) {
    try {
        const limited = await checkRateLimit(req, "generateReferral", "[Generate Referral]");
        if (limited) return limited;

        const body = await req.json().catch(() => ({}));
        const { contractAddress, creatorAddress } = body;

        if (!contractAddress || !isAddress(contractAddress)) {
            return NextResponse.json({ error: "Invalid contract address." }, { status: 400 });
        }
        if (creatorAddress && !isAddress(creatorAddress)) {
            return NextResponse.json({ error: "Invalid creator address." }, { status: 400 });
        }

        const normalizedContract = contractAddress.toLowerCase();
        const normalizedCreator = creatorAddress ? creatorAddress.toLowerCase() : null;

        // Verify the contract exists in the drops table (foreign key logically)
        const { data: dropData, error: dropError } = await supabase
            .from("drops")
            .select("id")
            .eq("contract_address", normalizedContract)
            .maybeSingle();

        if (dropError || !dropData) {
            return NextResponse.json({ error: "Drop not found." }, { status: 404 });
        }

        // Find existing code for this contract + creator pair
        let query = supabase
            .from("referral_links")
            .select("code")
            .eq("contract_address", normalizedContract);

        if (normalizedCreator) {
            query = query.eq("creator_address", normalizedCreator);
        } else {
            query = query.is("creator_address", null);
        }

        const { data: existing } = await query.maybeSingle();
        if (existing?.code) {
            return NextResponse.json({ code: existing.code });
        }

        // Generate a new unique code with collision retry limit
        let attempts = 0;
        let finalCode = null;

        while (attempts < 5) {
            const candidate = generateShortCode();
            const { error: insertError } = await supabase
                .from("referral_links")
                .insert({
                    code: candidate,
                    contract_address: normalizedContract,
                    creator_address: normalizedCreator
                });

            if (!insertError) {
                finalCode = candidate;
                break;
            } else if (insertError.code === "23505") { // unique constraint violation
                attempts++;
                continue;
            } else {
                console.error("Referral DB error:", insertError);
                return NextResponse.json({ error: "Database error." }, { status: 500 });
            }
        }

        if (!finalCode) {
            return NextResponse.json({ error: "Failed to generate unique code after multiple attempts." }, { status: 500 });
        }

        return NextResponse.json({ code: finalCode, newlyCreated: true });

    } catch (e) {
        console.error("Create referral error:", e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
