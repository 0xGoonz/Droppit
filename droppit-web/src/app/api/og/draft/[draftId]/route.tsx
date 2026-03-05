import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, formatEther, parseEther } from "viem";
import { base, baseSepolia } from "viem/chains";
import { FACTORY_ABI, getChainContracts } from "@/lib/contracts";
import {
    OG_BRAND,
    OG_TOKENS,
    creatorAttribution,
    deterministicAccent,
    fallbackTitle,
    formatMintPriceWei,
    formatStatusLabel,
    getChainLabel,
    normalizeIpfsToHttp,
    ogBackdrop,
    ogFontFamily,
    statusBadgeColors,
    truncateText,
} from "@/lib/og-utils";

export const runtime = "edge";

type DraftRow = {
    id: string;
    title: string | null;
    status: string | null;
    edition_size: number | null;
    mint_price: string | null;
    image_url: string | null;
    creator_address: string | null;
    creator_fid: number | null;
};

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ draftId: string }> }
) {
    try {
        const limited = await checkRateLimit(req, "ogRender", "[OG Render]");
        if (limited) return limited;

        const resolvedParams = await params;
        const draftId = resolvedParams.draftId;

        if (!draftId) {
            return new Response("Missing draftId parameter", { status: 400 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data } = await supabase
            .from("drops")
            .select("id, title, status, edition_size, mint_price, image_url, creator_address, creator_fid")
            .eq("id", draftId)
            .maybeSingle();

        const draft = (data || null) as DraftRow | null;

        let estimatedGas: string | null = null;
        try {
            const chainIdStr = process.env.NEXT_PUBLIC_CHAIN_ID || "8453";
            const chainId = parseInt(chainIdStr, 10) as 8453 | 84532;
            const activeChain = chainId === 84532 ? baseSepolia : base;
            const contracts = getChainContracts(chainId);
            if (!contracts?.factoryAddress) throw new Error("Missing factory contract configuration");

            const factoryAddress = contracts.factoryAddress;

            const publicClient = createPublicClient({
                chain: activeChain,
                transport: http()
            });

            const dummyTokenUri = "ipfs://QmDummyHash12345678901234567890123456789012345678901234567";
            const dummyCommitment = "0x" + "00".repeat(32);
            // Non-zero dummy address to avoid some zero-address revert rules if any exist in the EVM call stack
            const account = "0x0000000000000000000000000000000000000001" as `0x${string}`;

            const gas = await publicClient.estimateContractGas({
                address: factoryAddress as `0x${string}`,
                abi: FACTORY_ABI,
                functionName: "createDrop",
                account,
                args: [
                    BigInt(draft?.edition_size || 100),
                    parseEther(draft?.mint_price || "0"),
                    account, // payout recipient
                    dummyTokenUri,
                    dummyCommitment as `0x${string}`
                ]
            });
            const gasPrice = await publicClient.getGasPrice();
            const costWei = gas * gasPrice;
            estimatedGas = formatEther(costWei + (costWei / BigInt(10)));
        } catch (e) {
            console.warn("[OG Draft] Gas Estimate failed", e);
        }
        const title = fallbackTitle(draft?.title, "Untitled Draft");
        const titleSafe = truncateText(title, 46);
        const price = formatMintPriceWei(draft?.mint_price || "0");
        const chainLabel = getChainLabel();
        const statusLabel = formatStatusLabel(draft?.status || "DRAFT");
        const statusColors = statusBadgeColors(draft?.status || "DRAFT");
        const art = normalizeIpfsToHttp(draft?.image_url);
        const creator = creatorAttribution(draft?.creator_address, draft?.creator_fid);
        const accent = deterministicAccent(draft?.id || draftId);
        const hasArt = !!art;
        const artFallbackGlyph = titleSafe.charAt(0).toUpperCase() || "D";

        return new ImageResponse(
            (
                <div
                    style={{
                        width: OG_TOKENS.width,
                        height: OG_TOKENS.height,
                        display: "flex",
                        background: ogBackdrop(accent.glow),
                        color: OG_BRAND.text0,
                        fontFamily: ogFontFamily(),
                        padding: `${OG_TOKENS.safeY}px ${OG_TOKENS.safeX}px`,
                    }}
                >
                    <div
                        style={{
                            width: OG_TOKENS.artSize,
                            height: OG_TOKENS.artSize,
                            borderRadius: OG_TOKENS.radius,
                            marginRight: 36,
                            background: hasArt ? "rgba(255,255,255,0.02)" : `linear-gradient(145deg, ${accent.from}, ${accent.to})`,
                            border: "1px solid rgba(255,255,255,0.12)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                            alignSelf: "center",
                            boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
                        }}
                    >
                        {hasArt ? (
                            <img
                                alt=""
                                src={art as string}
                                width={OG_TOKENS.artSize}
                                height={OG_TOKENS.artSize}
                                style={{ objectFit: "cover" }}
                            />
                        ) : (
                            <span style={{ fontSize: 124, fontWeight: 800, opacity: 0.9 }}>{artFallbackGlyph}</span>
                        )}
                    </div>

                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            <div style={{ display: "flex", gap: 12 }}>
                                <span
                                    style={{
                                        fontSize: OG_TOKENS.badgeSize,
                                        padding: "7px 14px",
                                        borderRadius: 999,
                                        border: `1px solid ${statusColors.border}`,
                                        color: statusColors.fg,
                                        background: statusColors.bg,
                                    }}
                                >
                                    {statusLabel}
                                </span>
                                <span
                                    style={{
                                        fontSize: OG_TOKENS.badgeSize,
                                        padding: "7px 14px",
                                        borderRadius: 999,
                                        border: `1px solid ${OG_BRAND.blue}66`,
                                        color: "#cfe2ff",
                                        background: `${OG_BRAND.blue}2e`,
                                    }}
                                >
                                    {chainLabel}
                                </span>
                                <span
                                    style={{
                                        fontSize: OG_TOKENS.badgeSize,
                                        padding: "7px 14px",
                                        borderRadius: 999,
                                        border: "1px solid rgba(124,58,237,0.45)",
                                        color: "#e9ddff",
                                        background: "rgba(124,58,237,0.22)",
                                    }}
                                >
                                    Draft Preview
                                </span>
                            </div>

                            <div
                                style={{
                                    fontSize: OG_TOKENS.titleSize,
                                    lineHeight: 1.04,
                                    letterSpacing: "-0.025em",
                                    fontWeight: 800,
                                    maxWidth: 720,
                                }}
                            >
                                {titleSafe}
                            </div>

                            <div style={{ display: "flex", gap: 12 }}>
                                <span
                                    style={{
                                        fontSize: OG_TOKENS.subtitleSize,
                                        color: OG_BRAND.text0,
                                        background: "rgba(11,16,32,0.78)",
                                        border: "1px solid rgba(34,211,238,0.28)",
                                        borderRadius: 16,
                                        padding: "8px 16px",
                                    }}
                                >
                                    {price}
                                </span>
                                {estimatedGas && (
                                    <span
                                        style={{
                                            fontSize: OG_TOKENS.subtitleSize,
                                            color: "#e2e8f0",
                                            background: "rgba(11,16,32,0.78)",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            borderRadius: 16,
                                            padding: "8px 16px",
                                            display: "flex",
                                            alignItems: "center",
                                        }}
                                    >
                                        Est. Deploy: ~{parseFloat(estimatedGas).toFixed(4)} ETH
                                    </span>
                                )}
                            </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <span style={{ fontSize: OG_TOKENS.bodySize, color: OG_BRAND.text1 }}>
                                Creator: {creator}
                            </span>
                            <span style={{ fontSize: 18, color: OG_BRAND.text2 }}>
                                Draft ID: {truncateText(draftId, 16)}
                            </span>
                        </div>
                    </div>
                </div>
            ),
            {
                width: OG_TOKENS.width,
                height: OG_TOKENS.height,
            }
        );
    } catch (error) {
        console.error("[OG Draft] Failed to generate image:", error);
        return new Response("Failed to generate image", { status: 500 });
    }
}
