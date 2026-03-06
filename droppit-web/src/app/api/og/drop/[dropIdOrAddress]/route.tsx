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
export const dynamic = "force-dynamic";

const dropAbi = [
    { type: "function", name: "editionSize", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { type: "function", name: "totalMinted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { type: "function", name: "mintPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
    { type: "function", name: "uri", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "string" }] },
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

type OnchainSnapshot = {
    creatorAddress: string | null;
    tokenUri: string | null;
    mintPriceWei: string | null;
    metadataName: string | null;
    metadataImage: string | null;
};

function normalizeHandle(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const cleaned = raw.trim().replace(/^@+/, "").toLowerCase();
    return cleaned || null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs)),
    ]);
}

async function fetchTokenMetadata(tokenUri: string | null): Promise<{ name: string | null; image: string | null }> {
    const metadataUrl = normalizeIpfsToHttp(tokenUri);
    if (!metadataUrl) {
        return { name: null, image: null };
    }

    try {
        const response = await withTimeout(fetch(metadataUrl, { cache: "no-store" }), 1500, "Token metadata fetch");
        if (!response.ok) {
            return { name: null, image: null };
        }

        const metadata = await response.json().catch(() => null) as Record<string, unknown> | null;
        const name = typeof metadata?.name === "string" && metadata.name.trim() ? metadata.name.trim() : null;
        const image = typeof metadata?.image === "string" ? normalizeIpfsToHttp(metadata.image) : null;
        return { name, image };
    } catch (error) {
        console.warn("[OG Drop] Failed to fetch token metadata:", error);
        return { name: null, image: null };
    }
}

async function readOnchainSnapshot(contractAddress: `0x${string}`): Promise<OnchainSnapshot> {
    try {
        const [ownerResult, tokenUriResult, mintPriceResult] = await Promise.allSettled([
            withTimeout(
                publicClient.readContract({
                    address: contractAddress,
                    abi: dropAbi,
                    functionName: "owner",
                }),
                1500,
                "Drop owner read"
            ),
            withTimeout(
                publicClient.readContract({
                    address: contractAddress,
                    abi: dropAbi,
                    functionName: "uri",
                    args: [BigInt(1)],
                }),
                1500,
                "Drop token URI read"
            ),
            withTimeout(
                publicClient.readContract({
                    address: contractAddress,
                    abi: dropAbi,
                    functionName: "mintPrice",
                }),
                1500,
                "Drop mint price read"
            ),
        ]);

        const creatorAddress = ownerResult.status === "fulfilled" && typeof ownerResult.value === "string"
            ? ownerResult.value
            : null;
        const tokenUri = tokenUriResult.status === "fulfilled" && typeof tokenUriResult.value === "string"
            ? tokenUriResult.value
            : null;
        const mintPriceWei = mintPriceResult.status === "fulfilled"
            ? mintPriceResult.value.toString()
            : null;
        const metadata = await fetchTokenMetadata(tokenUri);

        return {
            creatorAddress,
            tokenUri,
            mintPriceWei,
            metadataName: metadata.name,
            metadataImage: metadata.image,
        };
    } catch (error) {
        console.warn("[OG Drop] Failed to read onchain snapshot:", error);
        return {
            creatorAddress: null,
            tokenUri: null,
            mintPriceWei: null,
            metadataName: null,
            metadataImage: null,
        };
    }
}

async function readSupplyLabel(contractAddress: `0x${string}`): Promise<string | null> {
    try {
        const [editionSize, totalMinted] = await withTimeout(
            Promise.all([
                publicClient.readContract({
                    address: contractAddress,
                    abi: dropAbi,
                    functionName: "editionSize",
                }),
                publicClient.readContract({
                    address: contractAddress,
                    abi: dropAbi,
                    functionName: "totalMinted",
                }),
            ]),
            1500,
            "Drop supply read"
        );
        const remaining = Math.max(0, Number(editionSize) - Number(totalMinted));
        return remaining === 0 ? "Sold Out" : `${remaining} remaining`;
    } catch (error) {
        console.warn("[OG Drop] Failed to fetch onchain supply:", error);
        return null;
    }
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ dropIdOrAddress: string }> }
) {
    try {
        const limited = await checkRateLimit(req, "ogRender", "[OG Render]");
        if (limited) return limited;
        const { dropIdOrAddress: identifier } = await params;

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const isContractLookup = isAddress(identifier, { strict: false });
        const dropQuery = supabase
            .from("drops")
            .select("id, title, creator_address, creator_fid, mint_price, status, image_url, contract_address");

        const { data } = isContractLookup
            ? await dropQuery.ilike("contract_address", identifier).maybeSingle()
            : await dropQuery.eq("id", identifier).maybeSingle();

        const drop = (data || null) as DropRow | null;
        const contractAddress = drop?.contract_address || (isContractLookup ? identifier : null);

        const needsOnchainBackfill = !!contractAddress && (
            !drop ||
            !drop.title?.trim() ||
            !drop.image_url ||
            !drop.creator_address ||
            drop.mint_price == null
        );
        const onchain = needsOnchainBackfill && contractAddress
            ? await readOnchainSnapshot(contractAddress as `0x${string}`)
            : null;

        const creatorAddress = drop?.creator_address || onchain?.creatorAddress || null;
        let creatorHandle: string | null = null;
        if (creatorAddress) {
            const { data: identity } = await supabase
                .from("identity_links")
                .select("handle")
                .eq("creator_address", creatorAddress.toLowerCase())
                .order("verified_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            creatorHandle = normalizeHandle((identity as IdentityRow | null)?.handle);
        }

        const resolvedTitle = drop?.title || onchain?.metadataName || null;
        const title = fallbackTitle(resolvedTitle, "Untitled Drop");
        const titleSafe = truncateText(title, 54);
        const art = normalizeIpfsToHttp(drop?.image_url) || onchain?.metadataImage || null;
        const status = drop?.status || (onchain ? "LIVE" : "UNKNOWN");
        const price = formatMintPriceWei(drop?.mint_price || onchain?.mintPriceWei || "0");
        const creator = creatorAttribution(creatorAddress, drop?.creator_fid, creatorHandle);
        const creatorSource = creatorHandle
            ? "Wallet-linked profile"
            : creatorAddress
                ? "Onchain creator"
                : drop?.creator_fid
                    ? "Farcaster source"
                    : "Unknown source";
        const contractSnippet = contractAddress
            ? truncateMiddle(contractAddress, 10, 8)
            : "Not deployed";
        const glyph = titleSafe.charAt(0).toUpperCase() || "D";
        const accent = deterministicAccent(drop?.id || contractAddress || identifier);
        const chainLabel = getChainLabel();
        const statusLabel = formatStatusLabel(status);
        const statusColors = statusBadgeColors(status);
        const supplyLabel = contractAddress && (status === "LIVE" || status === "PUBLISHED")
            ? await readSupplyLabel(contractAddress as `0x${string}`)
            : null;

        const hasCompleteCardData = Boolean(
            resolvedTitle?.trim() &&
            (creatorAddress || drop?.creator_fid) &&
            contractAddress
        );

        return new ImageResponse(
            (
                <div
                    style={{
                        width: OG_TOKENS.width,
                        height: OG_TOKENS.height,
                        display: "flex",
                        backgroundColor: OG_BRAND.background,
                        backgroundImage: ogBackdrop(accent.glow),
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
                headers: {
                    "Cache-Control": hasCompleteCardData
                        ? "public, max-age=60, stale-while-revalidate=300"
                        : "no-store",
                },
            }
        );
    } catch (error) {
        console.error("[OG Drop] Failed to generate image:", error);
        return new Response("Failed to generate image", { status: 500 });
    }
}
