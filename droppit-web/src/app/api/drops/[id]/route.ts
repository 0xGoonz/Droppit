import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { createPublicClient, http, isAddress } from "viem";
import { base, baseSepolia } from "viem/chains";

const dropAbi = [
    { type: "function", name: "editionSize", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { type: "function", name: "totalMinted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

/**
 * Lifecycle-aware GET payloads for `/api/drops/[id]`:
 * - DRAFT (200): legacy create-page hydration shape for editing.
 * - LIVE/PUBLISHED (409): non-editable payload including normalized onchain fields
 *   when `contract_address` is available: `onchainTotalMinted`, `onchainEditionSize`,
 *   and `onchainRemaining`.
 */

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const dropId = resolvedParams.id;

        if (!dropId) {
            return NextResponse.json({ error: "Missing drop ID" }, { status: 400 });
        }

        const supabaseAdmin = getServiceRoleClient();

        const { data, error } = await supabaseAdmin
            .from('drops')
            .select('id, title, description, edition_size, mint_price, payout_recipient, image_url, token_uri, locked_content_draft, status, contract_address')
            .eq('id', dropId)
            .single();

        if (error) {
            console.error("[Drops API GET] Database error:", error);
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: "Drop not found" }, { status: 404 });
            }
            return NextResponse.json({ error: "Failed to fetch drop" }, { status: 500 });
        }

        // ── Lifecycle Guards ───────────────────────────────────────
        // LIVE/PUBLISHED drops should not be re-deployed via the create page.
        // We still return lifecycle metadata and normalized onchain supply fields
        // so callers can display canonical mint progress without guessing.
        if (data.status === 'LIVE' || data.status === 'PUBLISHED') {
            let onchainEditionSize: number | null = null;
            let onchainTotalMinted: number | null = null;
            let onchainRemaining: number | null = null;

            if (data.contract_address && isAddress(data.contract_address)) {
                const chain = process.env.NEXT_PUBLIC_ENVIRONMENT === "sandbox" ? baseSepolia : base;
                const alchemyNetwork = process.env.NEXT_PUBLIC_ENVIRONMENT === "sandbox" ? "base-sepolia" : "base-mainnet";
                const rpcUrl = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
                    ? `https://${alchemyNetwork}.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
                    : undefined;

                const publicClient = createPublicClient({
                    chain,
                    transport: http(rpcUrl),
                });

                try {
                    const [editionSize, totalMinted] = await Promise.all([
                        publicClient.readContract({
                            address: data.contract_address as `0x${string}`,
                            abi: dropAbi,
                            functionName: "editionSize",
                        }),
                        publicClient.readContract({
                            address: data.contract_address as `0x${string}`,
                            abi: dropAbi,
                            functionName: "totalMinted",
                        }),
                    ]);

                    const editionSizeNum = Number(editionSize);
                    const totalMintedNum = Number(totalMinted);
                    onchainEditionSize = editionSizeNum;
                    onchainTotalMinted = totalMintedNum;
                    onchainRemaining = Math.max(0, editionSizeNum - totalMintedNum);
                } catch (onchainError) {
                    console.warn("[Drops API GET] Failed to fetch onchain supply metrics:", onchainError);
                }
            }

            return NextResponse.json(
                {
                    error: "This drop has already been published and cannot be re-deployed.",
                    status: data.status,
                    lifecycle: "NON_EDITABLE",
                    contractAddress: data.contract_address || null,
                    onchainTotalMinted,
                    onchainEditionSize,
                    onchainRemaining,
                },
                { status: 409 }
            );
        }

        // Any status that is not DRAFT is unexpected for the create flow
        if (data.status !== 'DRAFT') {
            return NextResponse.json(
                { error: `Drop is in an invalid state for editing: ${data.status}` },
                { status: 400 }
            );
        }

        // ── Return all fields the create page needs for hydration ──
        return NextResponse.json({
            title: data.title || "",
            description: data.description || "",
            editionSize: data.edition_size?.toString() || "100",
            mintPriceWei: data.mint_price ? data.mint_price.toString() : "0",
            payoutRecipient: data.payout_recipient || "",
            lockedContent: data.locked_content_draft || "",
            imageUrl: data.image_url || null,
            tokenUri: data.token_uri || null,
            status: data.status,
        }, { status: 200 });

    } catch (error) {
        console.error("[Drops API GET] Error processing request:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
