import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
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
    mint_price: string | null;
    image_url: string | null;
    creator_address: string | null;
    creator_fid: number | null;
};

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ draftId: string }> }
) {
    try {
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
            .select("id, title, status, mint_price, image_url, creator_address, creator_fid")
            .eq("id", draftId)
            .maybeSingle();

        const draft = (data || null) as DraftRow | null;
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
