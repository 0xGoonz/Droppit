import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { consumeNonceOnce } from "@/lib/nonce-consume";
import { verifyMessage } from "viem";

function normalizeHandle(raw: unknown): { plain: string; prefixed: string } | null {
    if (typeof raw !== "string") return null;
    const stripped = raw.trim().replace(/^@+/, "").toLowerCase();
    if (!stripped) return null;
    if (!/^[a-z0-9_.-]+$/.test(stripped)) return null;
    return { plain: stripped, prefixed: `@${stripped}` };
}

function parseLabeledLines(message: string): Map<string, string> {
    const parsed = new Map<string, string>();
    for (const rawLine of message.split("\n")) {
        const line = rawLine.trim();
        const separatorIndex = line.indexOf(":");
        if (separatorIndex <= 0) continue;
        const label = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        parsed.set(label, value);
    }
    return parsed;
}

/**
 * POST /api/identity/link/verify
 *
 * Verifies wallet signature against a structured identity_link nonce.
 * Nonce must match ALL of: action=identity_link, wallet, chain_id, used=false, not expired.
 *
 * The structured message embeds the handle, so we verify the handle in
 * the request body matches the one baked into the signed message.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { wallet, handle, signature, nonce } = body;
        const fid = body.fid || null;

        if (!wallet || !handle || !signature || !nonce) {
            return NextResponse.json({ error: "Missing required identity parameters." }, { status: 400 });
        }

        const normalizedHandleData = normalizeHandle(handle);
        if (!normalizedHandleData) {
            return NextResponse.json({ error: "Invalid handle format." }, { status: 400 });
        }

        const normalizedWallet = wallet.toLowerCase();
        const normalizedHandle = normalizedHandleData.plain;
        const normalizedHandlePrefixed = normalizedHandleData.prefixed;
        const expectedChainId = process.env.NEXT_PUBLIC_ENVIRONMENT === "production" ? "8453" : "84532";
        const expectedChainLabel = process.env.NEXT_PUBLIC_ENVIRONMENT === "production" ? "Base" : "Base Sepolia";
        const supabaseAdmin = getServiceRoleClient();

        // ── 1. Strict Multi-Field Nonce Verification ─────────────

        const { data: nonceData, error: nonceError } = await supabaseAdmin
            .from('nonces')
            .select('*')
            .eq('nonce', nonce)
            .eq('action', 'identity_link')
            .eq('chain_id', expectedChainId)
            .eq('used', false)
            .single();

        if (nonceError || !nonceData) {
            return NextResponse.json({ error: "Invalid or consumed challenge nonce." }, { status: 403 });
        }

        if (new Date(nonceData.expires_at) < new Date()) {
            return NextResponse.json({ error: "Nonce has expired. Please request a new challenge." }, { status: 403 });
        }

        if (nonceData.wallet !== normalizedWallet) {
            return NextResponse.json({ error: "Nonce was issued to a different wallet." }, { status: 403 });
        }

        // ── 2. Verify Embedded Payload Strings ──────────
        // The handle and metadata were baked into the structured message at nonce time.
        // Ensure the request handle matches what was actually signed, line-by-line.
        const nonceLines = parseLabeledLines(nonce);
        const requiredLabels = ["Action", "Handle", "Wallet", "Chain", "Nonce", "Issued At", "Expires At"];
        for (const label of requiredLabels) {
            if (!nonceLines.has(label)) {
                return NextResponse.json({ error: `Signed challenge is missing required field: ${label}.` }, { status: 403 });
            }
        }

        const actionValue = nonceLines.get("Action");
        if (actionValue !== "Link Farcaster handle") {
            return NextResponse.json({ error: "Invalid action type inside signed challenge." }, { status: 403 });
        }

        const walletValue = nonceLines.get("Wallet");
        if (walletValue?.toLowerCase() !== normalizedWallet) {
            return NextResponse.json({ error: "Wallet does not match the signed challenge." }, { status: 403 });
        }

        const chainValue = nonceLines.get("Chain");
        if (chainValue !== `${expectedChainLabel} (chainId ${expectedChainId})`) {
            return NextResponse.json({ error: "Chain does not match the signed challenge." }, { status: 403 });
        }

        const handleValue = nonceLines.get("Handle");
        const nonceHandleData = normalizeHandle(handleValue);
        if (!nonceHandleData || handleValue !== nonceHandleData.prefixed) {
            return NextResponse.json({ error: "Invalid handle formatting in signed challenge." }, { status: 403 });
        }

        if (nonceHandleData.prefixed !== normalizedHandlePrefixed) {
            return NextResponse.json({ error: "Handle does not match the signed challenge. Request a new nonce." }, { status: 403 });
        }

        // ── 3. Verify Wallet Signature ───────────────────────────

        const isValidSignature = await verifyMessage({
            address: wallet as `0x${string}`,
            message: nonce,
            signature: signature as `0x${string}`
        });

        if (!isValidSignature) {
            return NextResponse.json({ error: "Invalid signature. Recovery failed." }, { status: 403 });
        }

        // ── 4. Burn Nonce (anti-replay) ──────────────────────────

        const burnedNonce = await consumeNonceOnce(supabaseAdmin, {
            id: nonceData.id,
            nonce,
            wallet: normalizedWallet,
            action: "identity_link",
            chainId: expectedChainId,
        });
        if (!burnedNonce) {
            return NextResponse.json({ error: "Challenge nonce has already been consumed." }, { status: 403 });
        }

        // ── 5. Persist Identity Link ─────────────────────────────

        const { error: upsertError } = await supabaseAdmin
            .from('identity_links')
            .upsert({
                creator_address: normalizedWallet,
                handle: normalizedHandle,
                fid,
                signature,
                nonce,
                verified_at: new Date().toISOString()
            }, {
                onConflict: 'creator_address, handle'
            });

        if (upsertError) {
            console.error("[Identity Verify] Persistence error:", upsertError);
            return NextResponse.json({ error: "Failed to save identity link." }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: "Identity linked securely!" });

    } catch (e: unknown) {
        console.error("[Identity Verify] Error:", e);
        return NextResponse.json({ error: "Failed to cryptographically verify identity." }, { status: 500 });
    }
}
