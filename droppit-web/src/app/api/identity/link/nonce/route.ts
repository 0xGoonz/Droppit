import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { randomBytes } from "crypto";

function normalizeHandle(raw: unknown): { plain: string; prefixed: string } | null {
    if (typeof raw !== "string") return null;
    const stripped = raw.trim().replace(/^@+/, "").toLowerCase();
    if (!stripped) return null;
    if (!/^[a-z0-9_.-]+$/.test(stripped)) return null;
    return { plain: stripped, prefixed: `@${stripped}` };
}

/**
 * POST /api/identity/link/nonce
 *
 * Issues a structured challenge nonce for identity linking.
 * Action is server-enforced to 'identity_link'.
 *
 * The message payload includes structured fields for auditability:
 *   Action, Handle, Wallet, Chain, Nonce, Issued At, Expires At
 *
 * The client must pass { wallet, handle } so the handle is embedded
 * in the signed message and cannot be swapped after signing.
 */
export async function POST(request: NextRequest) {
    try {
        // Rate limit: nonce preset (20 reqs / 5 min)
        const limited = await checkRateLimit(request, "nonce", "[Identity Nonce]");
        if (limited) return limited;

        const { wallet, handle } = await request.json();

        if (!wallet) {
            return NextResponse.json({ error: "wallet is required." }, { status: 400 });
        }

        if (typeof handle !== "string" || !handle.trim()) {
            return NextResponse.json({ error: "handle is required." }, { status: 400 });
        }
        const normalizedHandleData = normalizeHandle(handle);
        if (!normalizedHandleData) {
            return NextResponse.json({ error: "Invalid handle format." }, { status: 400 });
        }

        const supabaseAdmin = getServiceRoleClient();

        const normalizedWallet = wallet.toLowerCase();
        const normalizedHandlePrefixed = normalizedHandleData.prefixed;
        const action = "identity_link";
        const isProd = process.env.NEXT_PUBLIC_ENVIRONMENT === "production";
        const chainId = isProd ? "8453" : "84532";
        const chainLabel = isProd ? "Base" : "Base Sepolia";

        const nonce = randomBytes(32).toString("hex");
        const issuedAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        // Structured message — each field is on its own labeled line for
        // deterministic parsing and auditability against the product spec.
        const message = [
            `[Droppit] Identity Link`,
            `Action: Link Farcaster handle`,
            `Handle: ${normalizedHandlePrefixed}`,
            `Wallet: ${normalizedWallet}`,
            `Chain: ${chainLabel} (chainId ${chainId})`,
            `Nonce: ${nonce}`,
            `Issued At: ${issuedAt}`,
            `Expires At: ${expiresAt}`,
        ].join("\n");

        // Invalidate any existing unused nonces for this wallet/action combo
        await supabaseAdmin
            .from("nonces")
            .update({ used: true })
            .eq("wallet", normalizedWallet)
            .eq("action", action)
            .eq("used", false);

        // Insert fresh nonce with chain_id binding
        const { error } = await supabaseAdmin.from("nonces").insert({
            wallet: normalizedWallet,
            action,
            nonce: message,
            chain_id: chainId,
            expires_at: expiresAt,
            used: false,
        });

        if (error) {
            console.error("[Identity Nonce] Allocation error:", error);
            return NextResponse.json({ error: "Failed to allocate identity challenge" }, { status: 500 });
        }

        return NextResponse.json({ nonce: message });

    } catch (e: unknown) {
        console.error("[Identity Nonce] Error:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
