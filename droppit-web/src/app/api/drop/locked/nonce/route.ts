import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import crypto from "crypto";

/**
 * POST /api/drop/locked/nonce
 *
 * Issues a challenge nonce for locked-content unlock.
 * Action is server-enforced to 'unlock'. Chain binding prevents
 * cross-network replay (Sepolia nonce can't unlock on mainnet).
 */
export async function POST(request: NextRequest) {
    try {
        // Rate limit: nonce preset (20 reqs / 5 min)
        const limited = await checkRateLimit(request, "nonce", "[Locked Nonce]");
        if (limited) return limited;

        const { wallet, dropContract } = await request.json();

        if (!wallet || !dropContract) {
            return NextResponse.json({ error: "wallet and dropContract are required." }, { status: 400 });
        }

        const supabaseAdmin = getServiceRoleClient();

        const normalizedWallet = wallet.toLowerCase();
        const normalizedContract = dropContract.toLowerCase();
        const action = "unlock";
        const chainId = process.env.NEXT_PUBLIC_ENVIRONMENT === "production" ? "8453" : "84532";

        const nonce = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        // Invalidate any existing unused nonces for this wallet/action/contract/chain combo
        await supabaseAdmin
            .from("nonces")
            .update({ used: true })
            .eq("wallet", normalizedWallet)
            .eq("action", action)
            .eq("drop_contract", normalizedContract)
            .eq("chain_id", chainId)
            .eq("used", false);

        // Insert fresh nonce with chain_id binding
        const { error } = await supabaseAdmin.from("nonces").insert({
            nonce,
            wallet: normalizedWallet,
            drop_contract: normalizedContract,
            action,
            chain_id: chainId,
            expires_at: expiresAt,
            used: false,
        });

        if (error) {
            console.error("[Locked Nonce] DB Insert Error:", error);
            return NextResponse.json({ error: "Failed to generate challenge" }, { status: 500 });
        }

        return NextResponse.json({ nonce });
    } catch (e) {
        console.error("[Locked Nonce] Error:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
