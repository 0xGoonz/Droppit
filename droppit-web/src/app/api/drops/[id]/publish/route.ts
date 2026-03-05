import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { base, baseSepolia } from "viem/chains";
import { createPublicClient, decodeEventLog, encodePacked, http, isAddress, keccak256, toBytes } from "viem";
import { getChainContracts } from "@/lib/contracts";
import {
    validateEvmAddress,
    validateTxHash,
    validateLockedContent,
} from "@/lib/validation/drops";
import { logOperationalEvent } from "@/lib/monitoring";

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

const DROP_CREATED_EVENT_TOPIC0 = keccak256(
    toBytes("DropCreated(address,address,uint256,uint256,address,address,uint256,string)")
);
const DROP_CREATED_EVENT_ABI = [
    {
        type: "event",
        name: "DropCreated",
        inputs: [
            { name: "creator", type: "address", indexed: true },
            { name: "drop", type: "address", indexed: true },
            { name: "editionSize", type: "uint256", indexed: false },
            { name: "mintPrice", type: "uint256", indexed: false },
            { name: "payoutRecipient", type: "address", indexed: false },
            { name: "protocolFeeRecipient", type: "address", indexed: false },
            { name: "protocolFeePerMint", type: "uint256", indexed: false },
            { name: "tokenUri", type: "string", indexed: false },
        ],
    },
] as const;

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

        const limited = await checkRateLimit(req, "publish", "[Draft Publish]");
        if (limited) return limited;

        const body = await req.json();

        // ── Strict Input Validation ──────────────────────────────

        const txHashCheck = validateTxHash(body.txHash);
        if (!txHashCheck.valid) return NextResponse.json({ error: txHashCheck.error }, { status: 400 });



        const addressCheck = validateEvmAddress(body.contractAddress, "contractAddress");
        if (!addressCheck.valid) return NextResponse.json({ error: addressCheck.error }, { status: 400 });

        const { tokenUri, imageUrl } = body;

        // ── Fetch Draft (for staged locked_content_draft) ────────

        const supabaseAdmin = getServiceRoleClient();

        const { data: draft, error: draftError } = await supabaseAdmin
            .from('drops')
            .select('id, status, locked_content_draft, creator_address, edition_size, mint_price, payout_recipient, token_uri, tx_hash_deploy')
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
                logOperationalEvent("publish_conflict", "already_live", { draftId });
                return NextResponse.json({ error: "Drop is already live. Published drops are immutable." }, { status: 409 });
            }
            logOperationalEvent("publish_conflict", "invalid_state", { draftId, status: existing.status });
            return NextResponse.json({ error: "Cannot publish drop in current state." }, { status: 400 });
        }

        // ── Task 7 & 8: TxHash Unique Guard & Immutability ────────
        // Prevent hijacking by taking an already published txHash and submitting it for a different draft.
        if (draft.tx_hash_deploy && draft.tx_hash_deploy.toLowerCase() !== txHashCheck.value.toLowerCase()) {
            return NextResponse.json({ error: "This draft is already bound to a different deployment transaction." }, { status: 409 });
        }

        const { data: txHashConflict } = await supabaseAdmin
            .from('drops')
            .select('id')
            .eq('tx_hash_deploy', txHashCheck.value)
            .neq('id', draftId)
            .maybeSingle();

        if (txHashConflict) {
            logOperationalEvent("publish_conflict", "tx_hash_reuse", { draftId, txHash: txHashCheck.value, conflictingId: txHashConflict.id });
            return NextResponse.json({ error: "This deployment transaction has already been used to publish another drop." }, { status: 409 });
        }

        const walletScopedLimited = await checkRateLimit(
            req,
            "publish",
            "[Draft Publish]",
            { identityParts: ["wallet", draft.creator_address] }
        );
        if (walletScopedLimited) return walletScopedLimited;

        // ── Resolve Locked Content with Precedence Rules ─────────
        // Priority: body.lockedContent (client override) > draft.locked_content_draft (staged from frame)

        // Verify deploy tx provenance before allowing DRAFT -> LIVE transition.
        const activeChain = process.env.NEXT_PUBLIC_ENVIRONMENT === "sandbox" ? baseSepolia : base;
        const alchemyNetwork = process.env.NEXT_PUBLIC_ENVIRONMENT === "sandbox" ? "base-sepolia" : "base-mainnet";
        const chainContracts = getChainContracts(activeChain.id);
        const configuredFactory = chainContracts?.factoryAddress;

        if (!configuredFactory || !isAddress(configuredFactory)) {
            return NextResponse.json(
                { error: `Factory address is not configured for ${activeChain.name}.` },
                { status: 500 }
            );
        }

        const rpcUrl = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
            ? `https://${alchemyNetwork}.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
            : undefined;
        const publicClient = createPublicClient({
            chain: activeChain,
            transport: http(rpcUrl),
        });

        let txReceipt: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>>;
        try {
            txReceipt = await publicClient.getTransactionReceipt({
                hash: txHashCheck.value as `0x${string}`,
            });
        } catch (receiptError) {
            const message = receiptError instanceof Error ? receiptError.message.toLowerCase() : "";
            if (message.includes("not found") || message.includes("missing")) {
                return NextResponse.json({
                    error: "Deployment transaction is pending or unavailable on the configured network. Wait for confirmation before publishing.",
                }, { status: 409 });
            }
            console.error("[Drops API] Failed to fetch deploy transaction receipt:", receiptError);
            return NextResponse.json({ error: "Unable to fetch deployment transaction receipt." }, { status: 500 });
        }

        if (txReceipt.status !== "success") {
            return NextResponse.json({
                error: "Deployment transaction did not succeed onchain. Cannot publish this draft.",
            }, { status: 422 });
        }

        const matchingDropCreatedLogs = txReceipt.logs.filter(
            (log) =>
                log.address.toLowerCase() === configuredFactory.toLowerCase() &&
                (log.topics[0]?.toLowerCase() || "") === DROP_CREATED_EVENT_TOPIC0.toLowerCase()
        );

        if (matchingDropCreatedLogs.length === 0) {
            return NextResponse.json({
                error: "No DropCreated event found from the configured factory in this deployment transaction.",
            }, { status: 422 });
        }

        let onchainDropAddress: string | null = null;
        for (const log of matchingDropCreatedLogs) {
            try {
                const decoded = decodeEventLog({
                    abi: DROP_CREATED_EVENT_ABI,
                    data: log.data,
                    topics: log.topics,
                    strict: true,
                });
                const drop = decoded.args.drop;
                if (typeof drop === "string" && isAddress(drop)) {
                    // ── Task 5: Verify DropCreated Event Fields Against Draft ────────
                    // This prevents malicious actors from deploying altered drops (e.g. wrong price, wrong recipient)
                    // and attaching them to a valid draft ID on Droppit.

                    // ── Task 6: Bind Farcaster-created Drops to Creator Wallet ───────
                    // If the draft lacks a creator (i.e. created via Farcaster Frame), we use the farcasterWallet payload.
                    const finalCreatorAddress = draft.creator_address || body.farcasterWallet;

                    if (!finalCreatorAddress || decoded.args.creator.toLowerCase() !== finalCreatorAddress.toLowerCase()) {
                        return NextResponse.json({ error: "Drop creation event creator does not match draft or verified Farcaster creator." }, { status: 422 });
                    }
                    if (decoded.args.editionSize.toString() !== draft.edition_size.toString()) {
                        return NextResponse.json({ error: "Drop creation event edition size does not match draft." }, { status: 422 });
                    }
                    if (decoded.args.mintPrice.toString() !== draft.mint_price.toString()) {
                        return NextResponse.json({ error: "Drop creation event mint price does not match draft." }, { status: 422 });
                    }
                    // Validate payout_recipient falls back to creator_address if not strictly set in the draft
                    const expectedPayout = (draft.payout_recipient || finalCreatorAddress)?.toLowerCase();
                    if (decoded.args.payoutRecipient.toLowerCase() !== expectedPayout) {
                        return NextResponse.json({ error: "Drop creation event payout recipient does not match draft expected payout recipient." }, { status: 422 });
                    }
                    if (decoded.args.tokenUri !== (tokenUri || draft.token_uri)) {
                        return NextResponse.json({ error: "Drop creation event token URI does not match provided or draft token URI." }, { status: 422 });
                    }

                    onchainDropAddress = drop;
                    break;
                }
            } catch {
                // Ignore malformed candidate logs and continue scanning.
            }
        }

        if (!onchainDropAddress) {
            return NextResponse.json({
                error: "Unable to decode a valid drop address from DropCreated event logs in this deployment transaction.",
            }, { status: 422 });
        }

        if (onchainDropAddress.toLowerCase() !== addressCheck.value.toLowerCase()) {
            return NextResponse.json({
                error: `Contract address mismatch. Requested ${addressCheck.value}, but receipt DropCreated emitted ${onchainDropAddress}.`,
            }, { status: 422 });
        }

        const rawLockedContent = body.lockedContent || draft.locked_content_draft || null;

        const lockedCheck = validateLockedContent(rawLockedContent);
        if (!lockedCheck.valid) return NextResponse.json({ error: lockedCheck.error }, { status: 400 });

        // ── Build Update Payload ─────────────────────────────────

        const updatePayload: Record<string, unknown> = {
            status: 'LIVE',
            tx_hash_deploy: txHashCheck.value,
            contract_address: addressCheck.value,
            locked_content_draft: null, // Always clear draft staging column
            deploy_salt: null,          // Clear staged deploy metadata once published
            deploy_commitment: null,
        };

        if (body.farcasterWallet && !draft.creator_address) {
            updatePayload.creator_address = body.farcasterWallet;
        }

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
            logOperationalEvent("publish_conflict", "race_condition", { draftId });
            return NextResponse.json({ error: "Drop was already published or no longer in DRAFT state." }, { status: 409 });
        }

        return NextResponse.json({ success: true, drop: data[0] });

    } catch (error) {
        console.error("[Drops API] Failed to publish drop:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
