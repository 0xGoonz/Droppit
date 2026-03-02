import { NextRequest, NextResponse } from 'next/server';
type FrameButton = { action: 'link' | 'tx'; label: string; target: string };
interface FrameOptions { buttons: FrameButton[]; image: { src: string }; postUrl: string }

function getFrameHtmlResponse(opts: FrameOptions): string {
    const buttonsHtml = opts.buttons.map((b, i) => `
        <meta property="fc:frame:button:${i + 1}" content="${b.label}" />
        <meta property="fc:frame:button:${i + 1}:action" content="${b.action}" />
        <meta property="fc:frame:button:${i + 1}:target" content="${b.target}" />
    `).join('\\n');

    return `<!DOCTYPE html><html><head>
        <meta property="fc:frame" content="vNext" />
        <meta property="fc:frame:image" content="${opts.image.src}" />
        <meta property="fc:frame:post_url" content="${opts.postUrl}" />
        ${buttonsHtml}
    </head></html>`;
}
import { createPublicClient, http, isAddress } from 'viem';
import { base } from 'viem/chains';

function buildFrameUrls(baseUrl: string, contractAddress: string) {
    return {
        dropUrl: `${baseUrl}/drop/base/${contractAddress}`,
        ogImageUrl: `${baseUrl}/api/og/drop/${contractAddress}`,
        postUrl: `${baseUrl}/api/frame/drop/${contractAddress}`,
        mintUrl: `${baseUrl}/api/frame/drop/${contractAddress}/mint`
    };
}

// Minimum ABI for reading drop details (e.g. mintPrice to ensure contract is live)
const DROP_ABI = [
    { type: 'function', name: 'mintPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }
] as const;

// ── Environment-aware chain config ──────────────────────────────
// Matches the same NEXT_PUBLIC_ENVIRONMENT switch used across the app
// (create/page.tsx, drop/locked/route.ts, mint/route.ts, stats/route.ts, etc.)
// Frame MVP is pinned to Base mainnet.
const activeChain = base;

// Prefer Alchemy RPC when configured; falls back to the chain's default public RPC.
const alchemyNetwork = 'base-mainnet';
const rpcUrl = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
    ? `https://${alchemyNetwork}.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    : undefined;

const publicClient = createPublicClient({
    chain: activeChain,
    transport: http(rpcUrl)
});

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ contractAddress: string }> }
) {
    try {
        const resolvedParams = await params;
        const contractAddress = resolvedParams.contractAddress;

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://droppit.ai';
        const urls = buildFrameUrls(baseUrl, contractAddress);

        if (!contractAddress || !isAddress(contractAddress)) {
            return new NextResponse(
                getFrameHtmlResponse({
                    buttons: [{ action: 'link', label: 'View Drop', target: urls.dropUrl }],
                    image: { src: urls.ogImageUrl },
                    postUrl: urls.postUrl,
                })
            );
        }

        try {
            // Verify contract is live/valid by attempting to read its mintPrice
            await publicClient.readContract({
                address: contractAddress as `0x${string}`,
                abi: DROP_ABI,
                functionName: 'mintPrice'
            });
        } catch (error) {
            console.error("Failed to verify contract for GET frame:", error);
            // Fallback to link frame if we can't prove canonical data from contract
            return new NextResponse(
                getFrameHtmlResponse({
                    buttons: [{ action: 'link', label: 'View Drop to Mint', target: urls.dropUrl }],
                    image: { src: urls.ogImageUrl },
                    postUrl: urls.postUrl,
                })
            );
        }

        // Return the valid Tx Frame pointing to the POST /mint route
        return new NextResponse(
            getFrameHtmlResponse({
                buttons: [
                    { action: 'tx', label: 'Mint 1', target: urls.mintUrl },
                    { action: 'link', label: 'Open mint page', target: urls.dropUrl }
                ],
                image: { src: urls.ogImageUrl },
                postUrl: urls.postUrl,
            })
        );
    } catch (error) {
        console.error(error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
