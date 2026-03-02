import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { isAddress } from "viem";
import { getServiceRoleClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/stats/auth/nonce
 *
 * Issues a one-time challenge nonce bound to stats access:
 * { wallet, action=stats_read, chain_id, drop_id|drop_contract }.
 */
export async function POST(request: NextRequest) {
    try {
        const limited = await checkRateLimit(request, "nonce", "[Stats Nonce]");
        if (limited) return limited;

        const body = await request.json();
        const walletRaw = typeof body.wallet === "string" ? body.wallet : "";
        const dropIdRaw = typeof body.dropId === "string" ? body.dropId : "";
        const contractRaw = typeof body.contractAddress === "string" ? body.contractAddress : "";

        if (!walletRaw || !isAddress(walletRaw)) {
            return NextResponse.json({ error: "wallet is required and must be a valid address." }, { status: 400 });
        }

        if (!dropIdRaw && !contractRaw) {
            return NextResponse.json({ error: "dropId or contractAddress is required." }, { status: 400 });
        }

        if (contractRaw && !isAddress(contractRaw)) {
            return NextResponse.json({ error: "contractAddress must be a valid address." }, { status: 400 });
        }

        const supabaseAdmin = getServiceRoleClient();
        const normalizedWallet = walletRaw.toLowerCase();
        const normalizedContract = contractRaw ? contractRaw.toLowerCase() : null;
        const normalizedDropId = dropIdRaw || null;
        const action = "stats_read";
        const chainId = process.env.NEXT_PUBLIC_ENVIRONMENT === "production" ? "8453" : "84532";
        const nonce = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        let invalidateQuery = supabaseAdmin
            .from("nonces")
            .update({ used: true })
            .eq("wallet", normalizedWallet)
            .eq("action", action)
            .eq("chain_id", chainId)
            .eq("used", false);

        if (normalizedDropId) {
            invalidateQuery = invalidateQuery.eq("drop_id", normalizedDropId);
        }
        if (normalizedContract) {
            invalidateQuery = invalidateQuery.eq("drop_contract", normalizedContract);
        }
        await invalidateQuery;

        const { error } = await supabaseAdmin.from("nonces").insert({
            nonce,
            wallet: normalizedWallet,
            drop_id: normalizedDropId,
            drop_contract: normalizedContract,
            action,
            chain_id: chainId,
            expires_at: expiresAt,
            used: false,
        });

        if (error) {
            console.error("[Stats Nonce] DB Insert Error:", error);
            return NextResponse.json({ error: "Failed to generate stats challenge" }, { status: 500 });
        }

        return NextResponse.json({ nonce });
    } catch (e) {
        console.error("[Stats Nonce] Error:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
