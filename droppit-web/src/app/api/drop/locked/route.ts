import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { consumeNonceOnce } from "@/lib/nonce-consume";
import { createPublicClient, http, parseAbi, verifyMessage, keccak256, encodePacked } from "viem";
import { base, baseSepolia } from "viem/chains";

const activeChain = process.env.NEXT_PUBLIC_ENVIRONMENT === 'production' ? base : baseSepolia;

// Prefer Alchemy RPC when configured
const isProduction = process.env.NEXT_PUBLIC_ENVIRONMENT === 'production';
const alchemyNetwork = isProduction ? 'base-mainnet' : 'base-sepolia';
const rpcUrl = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
    ? `https://${alchemyNetwork}.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    : undefined;

const publicClient = createPublicClient({
    chain: activeChain,
    transport: http(rpcUrl)
});

const dropAbi = parseAbi([
    "function balanceOf(address account, uint256 id) view returns (uint256)",
    "function lockedMessageCommitment() view returns (bytes32)"
]);

const NO_CACHE_HEADERS = {
    'Cache-Control': 'no-store, max-age=0, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
};

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * POST /api/drop/locked
 *
 * Verifies nonce + signature + onchain ownership, then returns decrypted locked content.
 * Nonce must match ALL of: action=unlock, wallet, drop_contract, used=false, not expired.
 *
 * After decryption, if the drop contract has a non-zero lockedMessageCommitment,
 * the server recomputes keccak256(encodePacked(salt, plaintext)) and compares
 * against the onchain value. Content is only revealed if they match.
 */
export async function POST(request: Request) {
    try {
        const { tokenUri, userAddress, contractAddress, signature, nonce } = await request.json();

        if (!tokenUri || !userAddress || !contractAddress || !signature || !nonce) {
            return NextResponse.json({ error: "Missing required parameters (including signature & nonce)" }, { status: 400, headers: NO_CACHE_HEADERS });
        }

        const normalizedWallet = userAddress.toLowerCase();
        const normalizedContract = contractAddress.toLowerCase();
        const expectedChainId = process.env.NEXT_PUBLIC_ENVIRONMENT === "production" ? "8453" : "84532";
        const supabaseAdmin = getServiceRoleClient();

        // ── 1. Strict Multi-Field Nonce Verification ─────────────

        const { data: nonceData, error: nonceError } = await supabaseAdmin
            .from('nonces')
            .select('*')
            .eq('nonce', nonce)
            .eq('action', 'unlock')
            .eq('chain_id', expectedChainId)
            .eq('used', false)
            .single();

        if (nonceError || !nonceData) {
            return NextResponse.json({ error: "Invalid or consumed challenge nonce." }, { status: 403, headers: NO_CACHE_HEADERS });
        }

        // Explicit mismatch checks for deterministic rejection
        if (new Date(nonceData.expires_at) < new Date()) {
            return NextResponse.json({ error: "Nonce has expired. Please request a new challenge." }, { status: 403, headers: NO_CACHE_HEADERS });
        }

        if (nonceData.wallet !== normalizedWallet) {
            return NextResponse.json({ error: "Nonce was issued to a different wallet." }, { status: 403, headers: NO_CACHE_HEADERS });
        }

        if (nonceData.drop_contract !== normalizedContract) {
            return NextResponse.json({ error: "Nonce was issued for a different drop contract." }, { status: 403, headers: NO_CACHE_HEADERS });
        }

        // ── 2. Verify Wallet Signature ───────────────────────────

        const isValidSignature = await verifyMessage({
            address: userAddress as `0x${string}`,
            message: nonce,
            signature: signature as `0x${string}`
        });

        if (!isValidSignature) {
            return NextResponse.json({ error: "Invalid signature." }, { status: 403, headers: NO_CACHE_HEADERS });
        }

        // ── 3. Burn Nonce (anti-replay) ──────────────────────────
        // Done AFTER signature verification but BEFORE content delivery

        const burnedNonce = await consumeNonceOnce(supabaseAdmin, {
            id: nonceData.id,
            nonce,
            wallet: normalizedWallet,
            action: "unlock",
            chainId: expectedChainId,
            dropContract: normalizedContract,
        });
        if (!burnedNonce) {
            return NextResponse.json({ error: "Challenge nonce has already been consumed." }, { status: 403, headers: NO_CACHE_HEADERS });
        }

        // ── 4. Verify Onchain Ownership ──────────────────────────

        const balance = await publicClient.readContract({
            address: contractAddress as `0x${string}`,
            abi: dropAbi,
            functionName: 'balanceOf',
            args: [userAddress as `0x${string}`, BigInt(1)]
        });

        if (balance === BigInt(0)) {
            return NextResponse.json(
                {
                    error: "Only holders can unlock this content. This wallet does not own token #1 for this drop.",
                    code: "NOT_HOLDER",
                },
                { status: 403, headers: NO_CACHE_HEADERS }
            );
        }

        // ── 5. Fetch & Decrypt Locked Content ────────────────────

        const { data, error } = await supabaseAdmin
            .from('drops')
            .select('locked_content, status')
            .eq('contract_address', normalizedContract)
            .single();

        if (error || !data) {
            console.error("Supabase Error:", error);
            return NextResponse.json({ lockedContent: "" }, { headers: NO_CACHE_HEADERS });
        }

        let returnedContent = data.locked_content;
        let commitmentSalt: string | null = null;

        try {
            const parsed = JSON.parse(returnedContent);
            if (parsed && typeof parsed === 'object' && parsed.encrypted) {
                // Extract salt before decryption (stored alongside ciphertext at publish time)
                if (parsed.salt && typeof parsed.salt === 'string') {
                    commitmentSalt = parsed.salt;
                }

                const { decryptLockedContent } = await import('@/lib/crypto/lockedContent');
                returnedContent = decryptLockedContent(parsed);
            }
        } catch {
            // Legacy plaintext fallback — no commitment verification possible
        }

        // ── 6. Onchain Commitment Verification ───────────────────
        // If the drop contract has a non-zero lockedMessageCommitment and
        // we have a salt from the stored payload, recompute the commitment
        // and compare. Never reveal content if they diverge.

        if (commitmentSalt && returnedContent) {
            try {
                const onchainCommitment = await publicClient.readContract({
                    address: contractAddress as `0x${string}`,
                    abi: dropAbi,
                    functionName: 'lockedMessageCommitment'
                });

                const commitmentHex = onchainCommitment as `0x${string}`;

                // Only enforce if contract has a non-zero commitment
                if (commitmentHex && commitmentHex !== ZERO_BYTES32) {
                    const recomputed = keccak256(
                        encodePacked(
                            ['bytes32', 'string'],
                            [commitmentSalt as `0x${string}`, returnedContent]
                        )
                    );

                    if (recomputed.toLowerCase() !== commitmentHex.toLowerCase()) {
                        console.error(
                            `[Locked] Commitment mismatch for ${normalizedContract}. ` +
                            `Onchain: ${commitmentHex}, Recomputed: ${recomputed}. Content NOT revealed.`
                        );
                        return NextResponse.json(
                            {
                                error: "Integrity check failed: the decrypted content does not match the onchain commitment. " +
                                    "This may indicate data corruption. Content has been withheld for safety.",
                            },
                            { status: 409, headers: NO_CACHE_HEADERS }
                        );
                    }

                    // Commitment verified ✓
                    console.log(`[Locked] Commitment verified for ${normalizedContract}`);
                }
            } catch (commitError) {
                // Contract may not implement lockedMessageCommitment() (pre-V1 drops).
                // If the RPC call fails, we cannot verify — treat as a server error
                // and refuse to reveal content to err on the side of safety.
                console.error("[Locked] Failed to read onchain commitment:", commitError);
                return NextResponse.json(
                    {
                        error: "Unable to verify onchain commitment. Content withheld pending verification.",
                    },
                    { status: 500, headers: NO_CACHE_HEADERS }
                );
            }
        }

        return NextResponse.json({ lockedContent: returnedContent }, { headers: NO_CACHE_HEADERS });

    } catch (e: unknown) {
        console.error("Locked content retrieval error:", e);
        return NextResponse.json({ error: "Failed to verify ownership or retrieve content" }, { status: 500, headers: NO_CACHE_HEADERS });
    }
}

