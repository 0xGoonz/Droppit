import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, isAddress } from "viem";
import { base, baseSepolia } from "viem/chains";
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
    truncateMiddle,
    truncateText,
} from "@/lib/og-utils";
import { getAlchemyNetworkId, isProductionEnvironment } from "@/lib/chains";

export const runtime = "edge";

const dropAbi = [
    { type: "function", name: "editionSize", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { type: "function", name: "totalMinted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const isProduction = isProductionEnvironment();
const activeChain = isProduction ? base : baseSepolia;
const alchemyNetwork = getAlchemyNetworkId();
const rpcUrl = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
    ? `https://${alchemyNetwork}.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    : undefined;

const publicClient = createPublicClient({
    chain: activeChain,
    transport: http(rpcUrl),
});

type DropRow = {
    id: string;
    title: string | null;
    creator_address: string | null;
    creator_fid: number | null;
    mint_price: string | null;
    status: string | null;
    image_url: string | null;
    contract_address: string | null;
};

type IdentityRow = {
    handle: string | null;
};

function normalizeHandle(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const cleaned = raw.trim().replace(/^@+/, "").toLowerCase();
    return cleaned || null;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ dropIdOrAddress: string }> }
) {
    try {
        const limited = await checkRateLimit(req, "ogRender", "[OG Render]");
        if (limited) return limited;
        const resolvedParams = await params;
        const identifier = resolvedParams.dropIdOrAddress;

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const isContractLookup = isAddress(identifier);
        const dropQuery = supabase
            .from("drops")
            .select("id, title, creator_address, creator_fid, mint_price, status, image_url, contract_address");

        const { data } = isContractLookup
            ? await dropQuery.eq("contract_address", identifier.toLowerCase()).maybeSingle()
            : await dropQuery.eq("id", identifier).maybeSingle();

        const drop = (data || null) as DropRow | null;
        const title = fallbackTitle(drop?.title, "Untitled Drop");
        const titleSafe = truncateText(title, 54);
        const chainLabel = getChainLabel();
        const statusLabel = formatStatusLabel(drop?.status || "UNKNOWN");
        const statusColors = statusBadgeColors(drop?.status);
        const price = formatMintPriceWei(drop?.mint_price || "0");
        const art = normalizeIpfsToHttp(drop?.image_url);
        const accent = deterministicAccent(drop?.id || identifier);

        let creatorHandle: string | null = null;
        if (drop?.creator_address) {
            const { data: identity } = await supabase
                .from("identity_links")
                .select("handle")
                .eq("creator_address", drop.creator_address.toLowerCase())
                .order("verified_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            creatorHandle = normalizeHandle((identity as IdentityRow | null)?.handle);
        }

        const creator = creatorAttribution(drop?.creator_address, drop?.creator_fid, creatorHandle);
        const creatorSource = creatorHandle
            ? "Wallet-linked profile"
            : drop?.creator_address
                ? "Onchain creator"
                : drop?.creator_fid
                    ? "Farcaster source"
                    : "Unknown source";
        const contractSnippet = drop?.contract_address
            ? truncateMiddle(drop.contract_address, 10, 8)
            : isContractLookup
                ? truncateMiddle(identifier, 10, 8)
                : "Not deployed";
        const glyph = titleSafe.charAt(0).toUpperCase() || "D";

        let supplyLabel: string | null = null;
        if (drop?.contract_address && (drop.status === 'LIVE' || drop.status === 'PUBLISHED')) {
            try {
                const [editionSize, totalMinted] = await Promise.all([
                    publicClient.readContract({
                        address: drop.contract_address as `0x${string}`,
                        abi: dropAbi,
                        functionName: "editionSize",
                    }),
                    publicClient.readContract({
                        address: drop.contract_address as `0x${string}`,
                        abi: dropAbi,
                        functionName: "totalMinted",
                    }),
                ]);
                const editionSizeNum = Number(editionSize);
                const totalMintedNum = Number(totalMinted);
                const remaining = Math.max(0, editionSizeNum - totalMintedNum);
                supplyLabel = `${remaining} remaining`;
                if (remaining === 0) supplyLabel = `Sold Out`;
            } catch (err) {
                console.warn("[OG Drop] Failed to fetch onchain supply:", err);
            }
        }

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
                            marginRight: 38,
                            alignSelf: "center",
                            background: art ? "rgba(255,255,255,0.02)" : `linear-gradient(150deg, ${accent.from}, ${accent.to})`,
                            border: "1px solid rgba(255,255,255,0.12)",
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 20px 44px rgba(0,0,0,0.35)",
                        }}
                    >
                        {art ? (
                            <img
                                alt=""
                                src={art}
                                width={OG_TOKENS.artSize}
                                height={OG_TOKENS.artSize}
                                style={{ objectFit: "cover" }}
                            />
                        ) : (
                            <span style={{ fontSize: 124, fontWeight: 800, opacity: 0.9 }}>{glyph}</span>
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
                            </div>

                            <div
                                style={{
                                    fontSize: OG_TOKENS.titleSize,
                                    lineHeight: 1.04,
                                    fontWeight: 800,
                                    letterSpacing: "-0.025em",
                                    maxWidth: 730,
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
                                {supplyLabel && (
                                    <span
                                        style={{
                                            fontSize: OG_TOKENS.subtitleSize,
                                            color: supplyLabel === "Sold Out" ? "#ef4444" : "#bae6fd",
                                            background: supplyLabel === "Sold Out" ? "rgba(239,68,68,0.1)" : "rgba(14,165,233,0.1)",
                                            border: `1px solid ${supplyLabel === "Sold Out" ? "rgba(239,68,68,0.3)" : "rgba(14,165,233,0.3)"}`,
                                            borderRadius: 16,
                                            padding: "8px 16px",
                                        }}
                                    >
                                        {supplyLabel}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <span style={{ fontSize: OG_TOKENS.bodySize, color: OG_BRAND.text1 }}>
                                Creator: {creator}
                            </span>
                            <span style={{ fontSize: 18, color: OG_BRAND.text2 }}>
                                Source: {creatorSource}
                            </span>
                            <span style={{ fontSize: 18, color: OG_BRAND.text2 }}>
                                Contract: {contractSnippet}
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
        console.error("[OG Drop] Failed to generate image:", error);
        return new Response("Failed to generate image", { status: 500 });
    }
}
