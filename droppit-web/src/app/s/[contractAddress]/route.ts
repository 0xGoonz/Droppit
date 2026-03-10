import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getDropFrameSpec } from "@/lib/drop-frame";
import { getDropShareEmbeds } from "@/lib/miniapp-embed";

export const dynamic = "force-dynamic";

function escapeSingleQuotedAttribute(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ contractAddress: string }> }
) {
    const { contractAddress } = await params;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://droppitonbase.xyz";
    const frame = getDropFrameSpec(baseUrl, contractAddress);
    const embeds = getDropShareEmbeds(frame);

    if (!contractAddress || !isAddress(contractAddress, { strict: false })) {
        return new NextResponse("Invalid drop address.", { status: 400 });
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Droppit Mint</title>
    <meta name="description" content="Mint this drop on Base via Droppit." />
    <link rel="canonical" href="${frame.dropUrl}" />
    <meta property="og:title" content="Droppit Mint" />
    <meta property="og:description" content="Mint this drop on Base via Droppit." />
    <meta property="og:url" content="${frame.shareUrl}" />
    <meta property="og:image" content="${frame.shareImageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="800" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Droppit Mint" />
    <meta name="twitter:description" content="Mint this drop on Base via Droppit." />
    <meta name="twitter:image" content="${frame.shareImageUrl}" />
    <meta name="fc:miniapp" content='${escapeSingleQuotedAttribute(JSON.stringify(embeds.miniapp))}' />
    <meta name="fc:frame" content='${escapeSingleQuotedAttribute(JSON.stringify(embeds.frame))}' />
</head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#05070f;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;">
    <main style="max-width:560px;padding:24px;text-align:center;">
        <h1 style="font-size:24px;margin:0 0 12px;">Droppit Mint</h1>
        <p style="margin:0 0 18px;color:#94a3b8;">Open the canonical mint page if you are viewing this link in a browser.</p>
        <a href="${frame.dropUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:linear-gradient(90deg,#0052FF,#22D3EE);color:#fff;text-decoration:none;font-weight:700;">Open mint page</a>
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