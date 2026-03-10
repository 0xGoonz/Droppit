import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAlchemyRpcUrl } from "@/lib/chains";
import { getServiceRoleClient } from "@/lib/supabase";
import { createPublicClient, http, formatEther } from "viem";
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
    getDraftTitlePresentation,
    normalizeIpfsToHttp,
    ogBackdrop,
    ogFontFamily,
    statusBadgeColors,
    truncateText,
} from "@/lib/og-utils";
import { MINIAPP_ARTWORK_BOUNDS, MINIAPP_SHARE_CARD } from "@/lib/share-card-layout";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type DraftRow = {
    id: string;
    title: string | null;
    status: string | null;
    edition_size: number | null;
    mint_price: string | null;
    image_url: string | null;
    creator_address: string | null;
    creator_fid: number | null;
    agent_parse: Record<string, unknown> | null;
};

type IdentityRow = {
    handle: string | null;
};

type EstimateErrorLike = {
    shortMessage?: string;
    message?: string;
    status?: number;
    url?: string;
};


function normalizeHandle(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const cleaned = raw.trim().replace(/^@+/, "").toLowerCase();
    return cleaned || null;
}

function extractWebhookAuthorHandle(agentParse: Record<string, unknown> | null | undefined): string | null {
    if (!agentParse || typeof agentParse !== "object") return null;

    const candidates = [
        agentParse.authorHandle,
        agentParse.authorUsername,
        agentParse.creatorHandle,
        agentParse.username,
    ];

    for (const candidate of candidates) {
        const normalized = normalizeHandle(candidate);
        if (normalized) return normalized;
    }

    return null;
}

function summarizeEstimateError(error: unknown): string {
    if (!error || typeof error !== "object") return "unknown error";

    const estimateError = error as EstimateErrorLike;
    const parts: string[] = [];

    if (typeof estimateError.shortMessage === "string" && estimateError.shortMessage.trim()) {
        parts.push(estimateError.shortMessage.trim());
    } else if (typeof estimateError.message === "string" && estimateError.message.trim()) {
        parts.push(estimateError.message.split("\n")[0].trim());
    }

    if (typeof estimateError.status === "number") {
        parts.push(`status ${estimateError.status}`);
    }

    if (typeof estimateError.url === "string") {
        try {
            parts.push(new URL(estimateError.url).hostname);
        } catch {
            parts.push(estimateError.url);
        }
    }

    return parts.join(" | ") || "unknown error";
}


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

        const supabase = getServiceRoleClient();
        const { data } = await supabase
            .from("drops")
            .select("id, title, status, edition_size, mint_price, image_url, creator_address, creator_fid, agent_parse")
            .eq("id", draftId)
            .maybeSingle();

        const draft = (data || null) as DraftRow | null;
        const isMiniAppVariant = req.nextUrl.searchParams.get("variant") === "miniapp";
        const title = fallbackTitle(draft?.title, "Untitled Draft");
        const titleSafe = truncateText(title, 46);
        const art = normalizeIpfsToHttp(draft?.image_url);
        const accent = deterministicAccent(draft?.id || draftId);
        const hasArt = !!art;
        const artFallbackGlyph = titleSafe.charAt(0).toUpperCase() || "D";

        if (isMiniAppVariant) {
            return new ImageResponse(
                (
                    <div
                        style={{
                            width: OG_TOKENS.width,
                            height: MINIAPP_SHARE_CARD.canvasHeight,
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
                                        height={MINIAPP_SHARE_CARD.canvasHeight}
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
                                        {hasArt ? (
                                            <img
                                                alt=""
                                                src={art as string}
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
                                            <span style={{ fontSize: 240, fontWeight: 800, opacity: 0.9, color: "white" }}>{artFallbackGlyph}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ),
                {
                    width: OG_TOKENS.width,
                    height: MINIAPP_SHARE_CARD.canvasHeight,
                    headers: {
                        "Cache-Control": "no-store, max-age=0, must-revalidate",
                    },
                }
            );
        }

        let estimatedGas: string | null = null;
        const rpcUrl = getAlchemyRpcUrl();
        if (rpcUrl) {
            try {
                const chainIdStr = process.env.NEXT_PUBLIC_CHAIN_ID || "8453";
                const chainId = parseInt(chainIdStr, 10) as 8453 | 84532;
                const activeChain = chainId === 84532 ? baseSepolia : base;
                const contracts = getChainContracts(chainId);
                if (!contracts?.factoryAddress) throw new Error("Missing factory contract configuration");

                const publicClient = createPublicClient({
                    chain: activeChain,
                    transport: http(rpcUrl),
                });

                const dummyTokenUri = "ipfs://QmDummyHash12345678901234567890123456789012345678901234567";
                const dummyCommitment = "0x" + "00".repeat(32);
                const account = "0x0000000000000000000000000000000000000001" as `0x${string}`;

                const gas = await publicClient.estimateContractGas({
                    address: contracts.factoryAddress as `0x${string}`,
                    abi: FACTORY_ABI,
                    functionName: "createDrop",
                    account,
                    args: [
                        BigInt(draft?.edition_size || 100),
                        BigInt(draft?.mint_price || "0"),
                        account,
                        dummyTokenUri,
                        dummyCommitment as `0x${string}`
                    ]
                });
                const gasPrice = await publicClient.getGasPrice();
                const costWei = gas * gasPrice;
                estimatedGas = formatEther(costWei + (costWei / BigInt(10)));
            } catch (error) {
                console.warn(`[OG Draft] Gas estimate unavailable via configured RPC: ${summarizeEstimateError(error)}`);
            }
        }

        const titlePresentation = getDraftTitlePresentation(titleSafe);
        const price = formatMintPriceWei(draft?.mint_price || "0");
        const chainLabel = getChainLabel();
        const statusLabel = formatStatusLabel(draft?.status || "DRAFT");
        const statusColors = statusBadgeColors(draft?.status || "DRAFT");
        const heroArtSize = 248;

        let estimateLabel: string | null = null;
        if (estimatedGas) {
            const numericEstimate = Number.parseFloat(estimatedGas);
            if (Number.isFinite(numericEstimate) && numericEstimate >= 0.0001) {
                estimateLabel = `Est. Deploy: ~${numericEstimate.toFixed(4)} ETH`;
            }
        }

        let creatorHandle = extractWebhookAuthorHandle(draft?.agent_parse);
        if (!creatorHandle && draft?.creator_address) {
            const { data: identity } = await supabase
                .from("identity_links")
                .select("handle")
                .eq("creator_address", draft.creator_address.toLowerCase())
                .order("verified_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            creatorHandle = normalizeHandle((identity as IdentityRow | null)?.handle);
        }

        const creator = creatorAttribution(draft?.creator_address, draft?.creator_fid, creatorHandle);

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
                            flex: 1,
                            display: "flex",
                            position: "relative",
                            overflow: "hidden",
                            borderRadius: 30,
                            padding: "30px 40px 26px",
                            background: "linear-gradient(180deg, rgba(6,13,28,0.96) 0%, rgba(6,18,38,0.92) 48%, rgba(4,12,28,0.94) 100%)",
                            border: "1px solid rgba(255,255,255,0.09)",
                            boxShadow: "0 26px 70px rgba(2,8,23,0.42)",
                        }}
                    >
                        <div
                            style={{
                                position: "absolute",
                                top: -150,
                                left: 0,
                                right: 0,
                                display: "flex",
                                justifyContent: "center",
                            }}
                        >
                            <div
                                style={{
                                    width: 520,
                                    height: 520,
                                    borderRadius: 999,
                                    background: `radial-gradient(circle, ${accent.glow} 0%, rgba(34,211,238,0.16) 32%, rgba(59,130,246,0.08) 52%, transparent 74%)`,
                                }}
                            />
                        </div>
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                background: "linear-gradient(180deg, rgba(6,12,24,0.08) 0%, rgba(6,12,24,0) 38%, rgba(4,10,21,0.28) 100%)",
                            }}
                        />
                        <div
                            style={{
                                flex: 1,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "space-between",
                                position: "relative",
                                zIndex: 1,
                            }}
                        >
                            <div
                                style={{
                                    width: "100%",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 14,
                                }}
                            >
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
                                            color: "#dbeafe",
                                            background: "rgba(59,130,246,0.24)",
                                        }}
                                    >
                                        {chainLabel}
                                    </span>
                                </div>

                                <div
                                    style={{
                                        fontSize: titlePresentation.fontSize,
                                        lineHeight: titlePresentation.lineHeight,
                                        letterSpacing: titlePresentation.letterSpacing,
                                        fontWeight: 800,
                                        maxWidth: titlePresentation.maxWidth,
                                        color: "#f8fbff",
                                        textShadow: "0 8px 24px rgba(2,8,23,0.38)",
                                        textAlign: "center",
                                    }}
                                >
                                    {titleSafe}
                                </div>

                                <div style={{ display: "flex", gap: 12 }}>
                                    <span
                                        style={{
                                            fontSize: OG_TOKENS.subtitleSize,
                                            color: "#f8fafc",
                                            background: "rgba(11,16,32,0.86)",
                                            border: "1px solid rgba(34,211,238,0.28)",
                                            borderRadius: 16,
                                            padding: "8px 18px",
                                        }}
                                    >
                                        {price}
                                    </span>
                                    {estimateLabel && (
                                        <span
                                            style={{
                                                fontSize: 20,
                                                color: "rgba(226,232,240,0.84)",
                                                background: "rgba(11,16,32,0.68)",
                                                border: "1px solid rgba(255,255,255,0.08)",
                                                borderRadius: 16,
                                                padding: "9px 16px",
                                                display: "flex",
                                                alignItems: "center",
                                            }}
                                        >
                                            {estimateLabel}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div
                                style={{
                                    width: "100%",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 16,
                                }}
                            >
                                <div
                                    style={{
                                        width: heroArtSize + 16,
                                        height: heroArtSize + 16,
                                        borderRadius: OG_TOKENS.radius + 8,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        background: "radial-gradient(circle at 50% 38%, rgba(255,255,255,0.08), rgba(255,255,255,0.02) 58%, rgba(255,255,255,0) 78%)",
                                        boxShadow: "0 28px 72px rgba(0,0,0,0.34)",
                                        overflow: "hidden",
                                    }}
                                >
                                    <div
                                        style={{
                                            width: heroArtSize,
                                            height: heroArtSize,
                                            borderRadius: OG_TOKENS.radius + 4,
                                            background: hasArt ? "rgba(255,255,255,0.03)" : `linear-gradient(145deg, ${accent.from}, ${accent.to})`,
                                            border: "1px solid rgba(255,255,255,0.14)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            overflow: "hidden",
                                        }}
                                    >
                                        {hasArt ? (
                                            <img
                                                alt=""
                                                src={art as string}
                                                width={heroArtSize}
                                                height={heroArtSize}
                                                style={{ objectFit: "cover" }}
                                            />
                                        ) : (
                                            <span style={{ fontSize: 124, fontWeight: 800, opacity: 0.9 }}>{artFallbackGlyph}</span>
                                        )}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: 8,
                                        width: "100%",
                                        borderTop: "1px solid rgba(255,255,255,0.06)",
                                        paddingTop: 16,
                                    }}
                                >
                                    <span style={{ fontSize: 20, color: "rgba(216,226,240,0.88)" }}>
                                        Creator: {creator}
                                    </span>
                                    <span style={{ fontSize: 16, color: "rgba(148,163,184,0.82)" }}>
                                        Draft ID: {truncateText(draftId, 16)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ),
            {
                width: OG_TOKENS.width,
                height: OG_TOKENS.height,
                headers: {
                    "Cache-Control": "no-store, max-age=0, must-revalidate",
                },
            }
        );
    } catch (error) {
        console.error("[OG Draft] Failed to generate image:", error);
        return new Response("Failed to generate image", { status: 500 });
    }
}

