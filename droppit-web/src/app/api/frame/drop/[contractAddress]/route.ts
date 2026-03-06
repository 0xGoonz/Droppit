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
import { getAlchemyRpcUrl } from '@/lib/chains';

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
// Check if the environment is explicitly set to production, otherwise default to baseSepolia
const isProduction = process.env.NEXT_PUBLIC_ENVIRONMENT === 'production';
const activeChain = isProduction ? base : require('viem/chains').baseSepolia;
const rpcUrlStr = isProduction ? 'base-mainnet' : 'base-sepolia';

// Provide a reliable fallback if Alchemy env var is not loaded
const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const rpcUrl = alchemyKey
    ? `https://${rpcUrlStr}.g.alchemy.com/v2/${alchemyKey}`
    : (isProduction ? 'https://mainnet.base.org' : 'https://sepolia.base.org');

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

        if (!contractAddress || !isAddress(contractAddress, { strict: false })) {
            return new NextResponse(
                getFrameHtmlResponse({
                    buttons: [{ action: 'link', label: 'View Drop', target: urls.dropUrl }],
                    image: { src: urls.ogImageUrl },
                    postUrl: urls.postUrl,
                })
            );
        }

        // --- Fire and forget view attribution for Frame render ---
        // (Do not await to avoid slowing down frame rendering)
        fetch(`${baseUrl}/api/attribution/view`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contractAddress: contractAddress.toLowerCase(),
                wallet: null, // Frame bots don't have connected wallets
                ref: 'farcaster_frame',
            }),
        }).catch(err => console.warn('Frame view attribution failed:', err));

        try {
            // Instead of querying the blockchain (which fails for uninstantiated proxies or wrong networks),
            // we query the database to verify the drop exists and is ready for minting.
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );

            const { data: drop, error } = await supabase
                .from('drops')
                .select('status')
                .ilike('contract_address', contractAddress)
                .maybeSingle();

            if (error || !drop || (drop.status !== 'LIVE' && drop.status !== 'PUBLISHED')) {
                throw new Error("Drop not found or not LIVE/PUBLISHED in database");
            }
        } catch (error) {
            console.error("Failed to verify contract for GET frame via DB:", error);
            // Fallback to link frame if we can't prove data from DB
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
                    { action: 'link', label: 'Open mint page', target: urls.dropUrl },
                    { action: 'link', label: 'Gift', target: `${urls.dropUrl}?gift=true` }
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
