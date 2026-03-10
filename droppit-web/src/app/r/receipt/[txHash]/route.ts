import { NextRequest, NextResponse } from "next/server";
import { BRAND } from "@/lib/brand";
import { isProductionEnvironment } from "@/lib/chains";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ txHash: string }> }
) {
    try {
        const resolvedParams = await params;
        const txHash = resolvedParams.txHash;
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://droppit.ai';
        const requestedVariant = req.nextUrl.searchParams.get("variant");
        const pageVariant = requestedVariant === "card" || requestedVariant === "square"
            ? requestedVariant
            : "square";
        const canonicalImageUrl = `${baseUrl}/api/receipt/${txHash}.png?variant=square`;
        const renderImageUrl = `${baseUrl}/api/receipt/${txHash}.png?variant=${pageVariant}`;

        const isProduction = isProductionEnvironment();
        const explorerBase = isProduction
            ? 'https://basescan.org'
            : 'https://sepolia.basescan.org';
        const networkLabel = isProduction ? 'Base' : 'Base Sepolia';

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Mint Receipt | ${BRAND.name}</title>
            <meta property="og:title" content="Mint Successful">
            <meta property="og:description" content="Click to view the transaction on ${networkLabel}">
            <meta property="og:image" content="${canonicalImageUrl}">
            <meta property="og:image:width" content="1080">
            <meta property="og:image:height" content="1080">
            <meta name="twitter:card" content="summary">
            <meta name="twitter:title" content="Mint Successful">
            <meta name="twitter:description" content="View transaction receipt from ${BRAND.shortName}.">
            <meta name="twitter:image" content="${canonicalImageUrl}">
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    background: radial-gradient(circle at top right, rgba(34,211,238,0.14), transparent 45%), radial-gradient(circle at top left, rgba(124,58,237,0.2), transparent 36%), #05070f;
                    font-family: "Plus Jakarta Sans", system-ui, sans-serif;
                }
                img {
                    max-width: 100%;
                    height: auto;
                    border-radius: 16px;
                    box-shadow: 0 16px 44px rgba(0,0,0,0.48);
                    border: 1px solid rgba(34,211,238,0.24);
                }
            </style>
        </head>
        <body>
            <a href="${explorerBase}/tx/${txHash}" target="_blank" rel="noopener noreferrer">
                <img src="${renderImageUrl}" alt="Transaction Receipt" />
            </a>
        </body>
        </html>
        `;

        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            }
        });
    } catch {
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
