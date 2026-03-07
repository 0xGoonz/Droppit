/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getServiceRoleClient } from "@/lib/supabase";
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
    getIpfsHttpCandidates,
    getChainLabel,
    normalizeIpfsToHttp,
    ogBackdrop,
    ogFontFamily,
    statusBadgeColors,
    truncateMiddle,
    truncateText,
} from "@/lib/og-utils";
import { getAlchemyNetworkId, isProductionEnvironment } from "@/lib/chains";
import { MINIAPP_ARTWORK_BOUNDS, MINIAPP_SHARE_CARD } from "@/lib/share-card-layout";
import { formatEditionSizeLabel } from "@/lib/drop-sharing";

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
    edition_size: number | null;
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

type TokenMetadataSnapshot = {
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
    const metadataUrls = getIpfsHttpCandidates(tokenUri);
    if (metadataUrls.length === 0) {
        return { name: null, image: null };
    }

    for (const metadataUrl of metadataUrls) {
        try {
            const response = await withTimeout(
                fetch(metadataUrl, {
                    cache: "no-store",
                    headers: { Accept: "application/json" },
                }),
                4000,
                "Token metadata fetch"
            );
            if (!response.ok) {
                continue;
            }

            const metadata = await response.json().catch(() => null) as Record<string, unknown> | null;
            const name = typeof metadata?.name === "string" && metadata.name.trim() ? metadata.name.trim() : null;
            const image = typeof metadata?.image === "string"
                ? normalizeIpfsToHttp(metadata.image, "https://gateway.pinata.cloud")
                : null;
            if (name || image) {
                return { name, image };
            }
        } catch (error) {
            console.warn("[OG Drop] Failed to fetch token metadata:", error);
        }
    }

    return { name: null, image: null };
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

async function readTokenMetadataSnapshot(contractAddress: `0x${string}`): Promise<TokenMetadataSnapshot> {
    try {
        const tokenUri = await withTimeout(
            publicClient.readContract({
                address: contractAddress,
                abi: dropAbi,
                functionName: "uri",
                args: [BigInt(1)],
            }),
            1500,
            "Drop token URI read"
        );
        if (typeof tokenUri !== "string") {
            return { metadataName: null, metadataImage: null };
        }

        const metadata = await fetchTokenMetadata(tokenUri);
        return {
            metadataName: metadata.name,
            metadataImage: metadata.image,
        };
    } catch (error) {
        console.warn("[OG Drop] Failed to read token metadata snapshot:", error);
        return {
            metadataName: null,
            metadataImage: null,
        };
    }
}

type SupplyLabels = {
    remainingLabel: string | null;
    editionLabel: string | null;
};

async function readSupplyLabels(contractAddress: `0x${string}`): Promise<SupplyLabels> {
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
        return {
            remainingLabel: remaining === 0 ? "Sold Out" : `${remaining} remaining`,
            editionLabel: formatEditionSizeLabel(editionSize.toString()),
        };
    } catch (error) {
        console.warn("[OG Drop] Failed to fetch onchain supply:", error);
        return {
            remainingLabel: null,
            editionLabel: null,
        };
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

        const supabase = getServiceRoleClient();

        const isContractLookup = isAddress(identifier, { strict: false });
        const dropQuery = supabase
            .from("drops")
            .select("id, title, creator_address, creator_fid, mint_price, status, image_url, contract_address, edition_size");

        const { data } = isContractLookup
            ? await dropQuery.ilike("contract_address", identifier).maybeSingle()
            : await dropQuery.eq("id", identifier).maybeSingle();

        const drop = (data || null) as DropRow | null;
        const contractAddress = drop?.contract_address || (isContractLookup ? identifier : null);
        const isMiniAppVariant = req.nextUrl.searchParams.get("variant") === "miniapp";
        const miniappMetadata = isMiniAppVariant && contractAddress
            ? await readTokenMetadataSnapshot(contractAddress as `0x${string}`)
            : null;

        const needsOnchainBackfill = !!contractAddress && (
            isMiniAppVariant
                ? (!drop || !drop.title?.trim() || !drop.image_url || !drop.edition_size)
                : (!drop || !drop.title?.trim() || !drop.image_url || !drop.creator_address || drop.mint_price == null)
        );
        const onchain = needsOnchainBackfill && contractAddress
            ? await readOnchainSnapshot(contractAddress as `0x${string}`)
            : null;

        const creatorAddress = drop?.creator_address || onchain?.creatorAddress || null;
        let creatorHandle: string | null = null;
        if (creatorAddress && !isMiniAppVariant) {
            const { data: identity } = await supabase
                .from("identity_links")
                .select("handle")
                .eq("creator_address", creatorAddress.toLowerCase())
                .order("verified_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            creatorHandle = normalizeHandle((identity as IdentityRow | null)?.handle);
        }

        const resolvedTitle = drop?.title || miniappMetadata?.metadataName || onchain?.metadataName || null;
        const title = fallbackTitle(resolvedTitle, "Untitled Drop");
        const titleSafe = truncateText(title, 54);
        const art = isMiniAppVariant
            ? miniappMetadata?.metadataImage || normalizeIpfsToHttp(drop?.image_url) || onchain?.metadataImage || null
            : normalizeIpfsToHttp(drop?.image_url) || onchain?.metadataImage || null;
        const canvasHeight = isMiniAppVariant ? 800 : OG_TOKENS.height;
        const status = drop?.status || (miniappMetadata?.metadataImage || miniappMetadata?.metadataName || onchain ? "LIVE" : "UNKNOWN");
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
        const supplyLabels = !isMiniAppVariant && contractAddress
            ? await readSupplyLabels(contractAddress as `0x${string}`)
            : { remainingLabel: null, editionLabel: null };
        const supplyLabel = !isMiniAppVariant && contractAddress && (status === "LIVE" || status === "PUBLISHED")
            ? supplyLabels.remainingLabel
            : null;

        const hasCompleteCardData = isMiniAppVariant
            ? Boolean(resolvedTitle?.trim() && art && contractAddress)
            : Boolean(
                resolvedTitle?.trim() &&
                art &&
                (creatorAddress || drop?.creator_fid) &&
                contractAddress
            );

        return new ImageResponse(
            (
                <div
                    style={{
                        width: OG_TOKENS.width,
                        height: canvasHeight,
                        display: "flex",
                        backgroundColor: OG_BRAND.background,
                        backgroundImage: ogBackdrop(accent.glow),
                        color: OG_BRAND.text0,
                        fontFamily: ogFontFamily(),
                        padding: `${OG_TOKENS.safeY}px ${OG_TOKENS.safeX}px`,
                    }}
                >
                    {isMiniAppVariant ? (
                        <div
                            style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                backgroundColor: "#020617",
                                backgroundImage: "radial-gradient(circle at 50% 0%, rgba(34,211,238,0.10), transparent 42%), radial-gradient(circle at 50% 100%, rgba(124,58,237,0.12), transparent 42%), linear-gradient(160deg, #020617 0%, #081121 100%)",
                                borderRadius: 30,
                                border: "1px solid rgba(255,255,255,0.07)",
                                overflow: "hidden",
                                boxShadow: "0 24px 56px rgba(0,0,0,0.28)",
                                padding: MINIAPP_SHARE_CARD.frameInset,
                            }}
                        >
                            <div
                                data-share-card-art-stage="miniapp"
                                style={{
                                    position: "relative",
                                    flex: 1,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    overflow: "hidden",
                                    borderRadius: 26,
                                    border: "1px solid rgba(255,255,255,0.04)",
                                    backgroundColor: art ? "rgba(3,7,18,0.78)" : undefined,
                                    backgroundImage: art
                                        ? "linear-gradient(180deg, rgba(2,6,23,0.12), rgba(2,6,23,0.32))"
                                        : `linear-gradient(150deg, ${accent.from}, ${accent.to})`,
                                }}
                            >
                                {art && (
                                    <img
                                        alt=""
                                        src={art}
                                        width={OG_TOKENS.width}
                                        height={canvasHeight}
                                        data-share-card-art-fill="miniapp"
                                        style={{
                                            position: "absolute",
                                            top: 0,
                                            right: 0,
                                            bottom: 0,
                                            left: 0,
                                            width: "100%",
                                            height: "100%",
                                            display: "block",
                                            objectFit: "cover",
                                            opacity: 0.28,
                                            filter: "blur(28px)",
                                            transform: "scale(1.18)",
                                        }}
                                    />
                                )}
                                <div
                                    data-share-card-art-tint="miniapp"
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        right: 0,
                                        bottom: 0,
                                        left: 0,
                                        backgroundColor: art ? "rgba(2,6,23,0.46)" : "transparent",
                                        backgroundImage: art
                                            ? "radial-gradient(circle at 50% 15%, rgba(124,58,237,0.18), transparent 36%), radial-gradient(circle at 50% 85%, rgba(0,82,255,0.16), transparent 40%)"
                                            : "none",
                                    }}
                                />
                                <div
                                    style={{
                                        position: "relative",
                                        zIndex: 1,
                                        flex: 1,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        padding: `${MINIAPP_SHARE_CARD.artPaddingTop}px ${MINIAPP_SHARE_CARD.artPaddingX}px ${MINIAPP_SHARE_CARD.artPaddingBottom}px`,
                                    }}
                                >
                                    <div
                                        data-share-card-art-frame="miniapp"
                                        style={{
                                            width: MINIAPP_ARTWORK_BOUNDS.width,
                                            height: MINIAPP_ARTWORK_BOUNDS.height,
                                            maxWidth: "100%",
                                            maxHeight: "100%",
                                            position: "relative",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            borderRadius: 28,
                                        }}
                                    >
                                        {art ? (
                                            <img
                                                alt=""
                                                src={art}
                                                width={MINIAPP_ARTWORK_BOUNDS.width}
                                                height={MINIAPP_ARTWORK_BOUNDS.height}
                                                data-share-card-artwork="miniapp"
                                                style={{
                                                    position: "relative",
                                                    zIndex: 1,
                                                    width: "100%",
                                                    height: "100%",
                                                    display: "block",
                                                    objectFit: "contain",
                                                    objectPosition: "center",
                                                }}
                                            />
                                        ) : (
                                            <span style={{ fontSize: 240, fontWeight: 800, opacity: 0.9, color: "white" }}>{glyph}</span>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>
                    ) : (
                        <>
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
                        </>
                    )}
                </div>
            ),
            {
                width: OG_TOKENS.width,
                height: canvasHeight,
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




























