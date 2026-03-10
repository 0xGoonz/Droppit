import { NextResponse } from "next/server";
import { getDraftShareSpec } from "@/lib/draft-share";
import { hasReusableDraftMedia } from "@/lib/draft-load";
import { getDraftShareEmbeds } from "@/lib/miniapp-embed";
import { getServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeSingleQuotedAttribute(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ draftId: string }> }
) {
    const { draftId } = await params;
    if (!draftId) {
        return new NextResponse("Missing draft ID.", { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://droppitonbase.xyz";
    const supabaseAdmin = getServiceRoleClient();
    const { data: draft, error } = await supabaseAdmin
        .from("drops")
        .select("id, title, token_uri, image_url")
        .eq("id", draftId)
        .maybeSingle();

    if (error || !draft) {
        return new NextResponse("Draft not found.", { status: 404 });
    }

    const hasReusableMedia = hasReusableDraftMedia(draft.token_uri, draft.image_url);
    const share = getDraftShareSpec(baseUrl, draftId, { hasReusableMedia });
    const embeds = getDraftShareEmbeds(share);
    const rawTitle = typeof draft.title === "string" && draft.title.trim() ? draft.title.trim() : "Untitled Draft";
    const title = escapeHtml(rawTitle);
    const description = escapeHtml(
        hasReusableMedia
            ? "Review this saved AI draft in Droppit and deploy it on Base."
            : "Upload high-resolution artwork for this AI draft in Droppit before deploying on Base."
    );
    const bodyCopy = escapeHtml(
        hasReusableMedia
            ? "Review this AI draft in Droppit, make final edits, and approve deployment when ready."
            : "This AI draft is missing reusable artwork. Upload a high-resolution image in Droppit before deploying."
    );

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} | Droppit Draft</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${escapeHtml(share.reviewUrl)}" />
    <meta property="og:title" content="${title} | Droppit Draft" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${escapeHtml(share.shareUrl)}" />
    <meta property="og:image" content="${escapeHtml(share.shareImageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="800" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title} | Droppit Draft" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${escapeHtml(share.shareImageUrl)}" />
    <meta name="fc:miniapp" content='${escapeSingleQuotedAttribute(JSON.stringify(embeds.miniapp))}' />
    <meta name="fc:frame" content='${escapeSingleQuotedAttribute(JSON.stringify(embeds.frame))}' />
</head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#05070f;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;">
    <main style="max-width:560px;padding:24px;text-align:center;">
        <h1 style="font-size:24px;margin:0 0 12px;">${title}</h1>
        <p style="margin:0 0 18px;color:#94a3b8;">${bodyCopy}</p>
        <a href="${escapeHtml(share.reviewUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:linear-gradient(90deg,#0052FF,#22D3EE);color:#fff;text-decoration:none;font-weight:700;">${escapeHtml(share.buttonTitle)}</a>
    </main>
</body>
</html>`;

    return new NextResponse(html, {
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
    });
}
