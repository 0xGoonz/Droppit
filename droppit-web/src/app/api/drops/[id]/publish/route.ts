import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { keccak256, encodePacked } from "viem";
import {
    validateEvmAddress,
    validateTxHash,
    validateLockedContent,
} from "@/lib/validation/drops";

// ── Helpers ──────────────────────────────────────────────────────

/** Validate that a salt is a proper 66-char hex string (0x + 64 hex chars). */
function validateSalt(raw: unknown): { valid: true; value: string } | { valid: false; error: string } {
    if (!raw || typeof raw !== "string") {
        return { valid: false, error: "salt is required when locked content is present." };
    }
    const trimmed = raw.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
        return { valid: false, error: "salt must be a 66-character hex string (0x + 64 hex chars)." };
    }
    return { valid: true, value: trimmed };
}

/** Validate that a commitment is a proper 66-char hex string. */
function validateCommitment(raw: unknown): { valid: true; value: string } | { valid: false; error: string } {
    if (!raw || typeof raw !== "string") {
        return { valid: false, error: "commitment is required when locked content is present." };
    }
    const trimmed = raw.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
        return { valid: false, error: "commitment must be a 66-character hex string (0x + 64 hex chars)." };
    }
    return { valid: true, value: trimmed };
}

// ── Route Handler ────────────────────────────────────────────────

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const draftId = resolvedParams.id;

        if (!draftId) {
            return NextResponse.json({ error: "Missing draft ID" }, { status: 400 });
        }

        const limited = await checkRateLimit(req, "draftPublish", "[Draft Publish]");
        if (limited) return limited;

        const body = await req.json();

        // ── Strict Input Validation ──────────────────────────────

        const txHashCheck = validateTxHash(body.txHash);
        if (!txHashCheck.valid) return NextResponse.json({ error: txHashCheck.error }, { status: 400 });

        const draftScopedLimited = await checkRateLimit(
            req,
            "draftPublish",
            "[Draft Publish]",
            { identityParts: ["drop", draftId, "tx", txHashCheck.value] }
        );
        if (draftScopedLimited) return draftScopedLimited;

        const addressCheck = validateEvmAddress(body.contractAddress, "contractAddress");
        if (!addressCheck.valid) return NextResponse.json({ error: addressCheck.error }, { status: 400 });

        const { tokenUri, imageUrl } = body;

        // ── Fetch Draft (for staged locked_content_draft) ────────

        const supabaseAdmin = getServiceRoleClient();

        const { data: draft, error: draftError } = await supabaseAdmin
            .from('drops')
            .select('id, status, locked_content_draft')
            .eq('id', draftId)
            .eq('status', 'DRAFT')
            .single();

        if (draftError || !draft) {
            // Determine the reason for failure
            const { data: existing } = await supabaseAdmin
                .from('drops')
                .select('status')
                .eq('id', draftId)
                .single();

            if (!existing) {
                return NextResponse.json({ error: "Draft not found." }, { status: 404 });
            }
            if (existing.status === 'LIVE') {
                return NextResponse.json({ error: "Drop is already live. Published drops are immutable." }, { status: 409 });
            }
            return NextResponse.json({ error: "Cannot publish drop in current state." }, { status: 400 });
        }

        // ── Resolve Locked Content with Precedence Rules ─────────
        // Priority: body.lockedContent (client override) > draft.locked_content_draft (staged from frame)

        const rawLockedContent = body.lockedContent || draft.locked_content_draft || null;

        const lockedCheck = validateLockedContent(rawLockedContent);
        if (!lockedCheck.valid) return NextResponse.json({ error: lockedCheck.error }, { status: 400 });

        // ── Build Update Payload ─────────────────────────────────

        const updatePayload: Record<string, unknown> = {
            status: 'LIVE',
            tx_hash_deploy: txHashCheck.value,
            contract_address: addressCheck.value,
            locked_content_draft: null, // Always clear draft staging column
        };

        if (tokenUri) updatePayload.token_uri = tokenUri;
        if (imageUrl) updatePayload.image_url = imageUrl;

        // ── Encrypt Locked Content (if present) ──────────────────

        if (lockedCheck.value) {
            // Require salt and commitment when locked content is present
            const saltCheck = validateSalt(body.salt);
            if (!saltCheck.valid) return NextResponse.json({ error: saltCheck.error }, { status: 400 });

            const commitCheck = validateCommitment(body.commitment);
            if (!commitCheck.valid) return NextResponse.json({ error: commitCheck.error }, { status: 400 });

            // ── Commitment Verification ──────────────────────────
            // Recompute commitment server-side to ensure the onchain commitment
            // was derived from the same plaintext + salt that we're about to encrypt.
            // This prevents commitment/decryption mismatch.

            const expectedCommitment = keccak256(
                encodePacked(
                    ['bytes32', 'string'],
                    [saltCheck.value as `0x${string}`, lockedCheck.value]
                )
            );

            if (expectedCommitment.toLowerCase() !== commitCheck.value.toLowerCase()) {
                return NextResponse.json({
                    error: "Commitment mismatch: the provided commitment does not match keccak256(salt || lockedContent). " +
                        "This indicates the onchain commitment and the plaintext being encrypted are derived from different sources."
                }, { status: 400 });
            }

            // Encrypt exactly once
            const { encryptLockedContent } = await import('@/lib/crypto/lockedContent');
            const encryptedPayload = encryptLockedContent(lockedCheck.value);
            // Append the salt to the JSON payload for future verification
            const payloadWithSalt = { ...encryptedPayload, salt: saltCheck.value };
            updatePayload.locked_content = JSON.stringify(payloadWithSalt);
        }

        // ── Atomic Publish (no race window) ──────────────────────
        // Single UPDATE with status='DRAFT' guard — if two concurrent
        // requests hit this, only the first one sees a matching row.

        const { data, error } = await supabaseAdmin
            .from('drops')
            .update(updatePayload)
            .eq('id', draftId)
            .eq('status', 'DRAFT')  // DB-level guard: only transition DRAFT→LIVE
            .select('*');

        if (error) {
            console.error("[Drops API] Error publishing draft:", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        // If no rows were updated, a race condition resolved against us
        if (!data || data.length === 0) {
            return NextResponse.json({ error: "Drop was already published or no longer in DRAFT state." }, { status: 409 });
        }

        return NextResponse.json({ success: true, drop: data[0] });

    } catch (error) {
        console.error("[Drops API] Failed to publish drop:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
