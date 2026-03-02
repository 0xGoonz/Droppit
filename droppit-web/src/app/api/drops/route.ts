import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import {
    validateTitle,
    validateEditionSize,
    validateMintPriceWei,
    validateEvmAddress,
} from "@/lib/validation/drops";

export async function POST(req: NextRequest) {
    try {
        const limited = await checkRateLimit(req, "draftCreate", "[Draft Create]");
        if (limited) return limited;

        const body = await req.json();
        const { description, imageUrl, tokenUri } = body;

        // ── Strict Input Validation ──────────────────────────────

        const titleCheck = validateTitle(body.title);
        if (!titleCheck.valid) return NextResponse.json({ error: titleCheck.error }, { status: 400 });

        const editionCheck = validateEditionSize(body.editionSize);
        if (!editionCheck.valid) return NextResponse.json({ error: editionCheck.error }, { status: 400 });

        const priceCheck = validateMintPriceWei(body.mintPriceWei);
        if (!priceCheck.valid) return NextResponse.json({ error: priceCheck.error }, { status: 400 });

        const addressCheck = validateEvmAddress(body.creatorAddress, "creatorAddress");
        if (!addressCheck.valid) return NextResponse.json({ error: addressCheck.error }, { status: 400 });

        const walletScopedLimited = await checkRateLimit(
            req,
            "draftCreate",
            "[Draft Create]",
            { identityParts: ["wallet", addressCheck.value] }
        );
        if (walletScopedLimited) return walletScopedLimited;

        let finalPayoutRecipient = addressCheck.value;
        if (body.payoutRecipient && body.payoutRecipient.trim() !== "") {
            const payoutCheck = validateEvmAddress(body.payoutRecipient, "payoutRecipient");
            if (!payoutCheck.valid) return NextResponse.json({ error: payoutCheck.error }, { status: 400 });
            finalPayoutRecipient = payoutCheck.value;
        }

        // ── DB Write ─────────────────────────────────────────────

        const supabaseAdmin = getServiceRoleClient();

        const { data, error } = await supabaseAdmin
            .from('drops')
            .insert({
                creator_address: addressCheck.value,
                title: titleCheck.value,
                description: description || null,
                edition_size: editionCheck.value,
                mint_price: priceCheck.value, // Stored as string, no float precision loss
                image_url: imageUrl || null,
                token_uri: tokenUri || null,
                payout_recipient: finalPayoutRecipient,
                status: 'DRAFT',
            })
            .select('id')
            .single();

        if (error) {
            console.error("[Drops API] Error creating draft:", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ success: true, dropId: data.id }, { status: 201 });

    } catch (error) {
        console.error("[Drops API] Failed to create drop draft:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
