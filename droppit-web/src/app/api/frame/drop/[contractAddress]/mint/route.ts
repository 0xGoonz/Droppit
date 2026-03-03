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
import { createPublicClient, http, encodeFunctionData, isAddress } from 'viem';
import { base } from 'viem/chains';
import { getAlchemyRpcUrl } from '@/lib/chains';

// ── Environment-aware chain config ──────────────────────────────
// Matches the same NEXT_PUBLIC_ENVIRONMENT switch used across the app
// (create/page.tsx, drop/locked/route.ts, receipt/[txHash]/route.tsx, etc.)
// Frame MVP is pinned to Base mainnet.
const activeChain = base;
const FRAME_MVP_CHAIN_ID = "eip155:8453";
const rpcUrl = getAlchemyRpcUrl('base-mainnet');

// Minimum ABI for minting and reading price
const DROP_ABI = [
    {
        type: "function",
        name: "mint",
        inputs: [{ name: "quantity", type: "uint256" }],
        stateMutability: "payable"
    },
    { type: 'function', name: 'mintPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'protocolFeePerMint', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'error', name: 'IncorrectPayment', inputs: [] },
    { type: 'error', name: 'SoldOut', inputs: [] },
    { type: 'error', name: 'InvalidQuantity', inputs: [] },
    { type: 'error', name: 'ProtocolFeeTransferFailed', inputs: [] }
] as const;

const publicClient = createPublicClient({
    chain: activeChain,
    transport: http(rpcUrl)
});

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ contractAddress: string }> }
) {
    try {
        const body = await req.json();
        const resolvedParams = await params;
        const contractAddress = resolvedParams.contractAddress;

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://droppit.ai';

        if (!contractAddress || !isAddress(contractAddress)) {
            return new NextResponse(
                getFrameHtmlResponse({
                    buttons: [{ action: 'link', label: 'Open mint page', target: `${baseUrl}/drop/base/${contractAddress}` }],
                    image: { src: `${baseUrl}/api/og/drop/${contractAddress}` },
                    postUrl: `${baseUrl}/api/frame/drop/${contractAddress}/mint`,
                })
            );
        }

        // ── Validate frame payload shape ──────────────────────────
        // trustedData.messageBytes must be present and a valid hex string
        // before we send it to Neynar for signature verification.
        const trustedData = body?.trustedData;
        const messageBytes = trustedData?.messageBytes;

        if (!trustedData || typeof messageBytes !== 'string' || !messageBytes.trim()) {
            console.warn(
                `[Frame Mint] Rejected: Missing or invalid trustedData.messageBytes.`,
                { hasTrustedData: !!trustedData, messageBytesType: typeof messageBytes }
            );
            return new NextResponse(
                getFrameHtmlResponse({
                    buttons: [{ action: 'link', label: 'Open mint page', target: `${baseUrl}/drop/base/${contractAddress}` }],
                    image: { src: `${baseUrl}/api/og/drop/${contractAddress}` },
                    postUrl: `${baseUrl}/api/frame/drop/${contractAddress}/mint`,
                }),
                { status: 400 }
            );
        }

        // messageBytes should be a hex string (with or without 0x prefix).
        // Neynar expects hex; reject obviously non-hex data early.
        const trimmedBytes = messageBytes.trim();
        if (!/^(0x)?[a-fA-F0-9]+$/.test(trimmedBytes) || trimmedBytes.replace(/^0x/, '').length < 2) {
            console.warn(
                `[Frame Mint] Rejected: messageBytes is not valid hex.`,
                { length: trimmedBytes.length, prefix: trimmedBytes.slice(0, 6) + '…' }
            );
            return new NextResponse(
                getFrameHtmlResponse({
                    buttons: [{ action: 'link', label: 'Open mint page', target: `${baseUrl}/drop/base/${contractAddress}` }],
                    image: { src: `${baseUrl}/api/og/drop/${contractAddress}` },
                    postUrl: `${baseUrl}/api/frame/drop/${contractAddress}/mint`,
                }),
                { status: 400 }
            );
        }

        // ── Validate message signature with Neynar ──────────────
        let isValid = false;
        let message = { button: 0 };
        try {
            const neynarRes = await fetch("https://api.neynar.com/v2/farcaster/frame/validate", {
                method: "POST",
                headers: { "api_key": process.env.NEYNAR_API_KEY || "", "content-type": "application/json" },
                body: JSON.stringify({ message_bytes_in_hex: trimmedBytes })
            });
            const data = await neynarRes.json();
            isValid = data.valid;
            message.button = data.action?.tapped_button?.index || 0;

            if (!isValid) {
                console.warn(`[Frame Mint] Neynar validation failed.`, { valid: data.valid, hasAction: !!data.action });
            }
        } catch (e) {
            console.error("[Frame Mint] Neynar validation error:", e instanceof Error ? e.message : 'Unknown error');
        }

        if (!isValid) {
            return new NextResponse(
                getFrameHtmlResponse({
                    buttons: [{ action: 'link', label: 'Open mint page', target: `${baseUrl}/drop/base/${contractAddress}` }],
                    image: { src: `${baseUrl}/api/og/drop/${contractAddress}` },
                    postUrl: `${baseUrl}/api/frame/drop/${contractAddress}/mint`,
                }),
                { status: 400 }
            );
        }

        let exactCostWei = "0";
        try {
            const [mintPrice, protocolFee] = await Promise.all([
                publicClient.readContract({
                    address: contractAddress as `0x${string}`,
                    abi: DROP_ABI,
                    functionName: 'mintPrice'
                }),
                publicClient.readContract({
                    address: contractAddress as `0x${string}`,
                    abi: DROP_ABI,
                    functionName: 'protocolFeePerMint'
                })
            ]);
            exactCostWei = ((mintPrice as bigint) + (protocolFee as bigint)).toString();
        } catch (error) {
            console.error("Failed to read contract data for frame:", error);
            // Fallback to link frame if we can't get canonical data from contract
            return new NextResponse(
                getFrameHtmlResponse({
                    buttons: [{ action: 'link', label: 'Open mint page', target: `${baseUrl}/drop/base/${contractAddress}` }],
                    image: { src: `${baseUrl}/api/og/drop/${contractAddress}` },
                    postUrl: `${baseUrl}/api/frame/drop/${contractAddress}/mint`,
                })
            );
        }

        // For Farcaster Transaction Frames, return a JSON tx payload
        if (message.button === 1) { // Mint Button clicked
            const txData = encodeFunctionData({
                abi: DROP_ABI,
                functionName: 'mint',
                args: [BigInt(1)]
            });

            return NextResponse.json({
                chainId: FRAME_MVP_CHAIN_ID,
                method: 'eth_sendTransaction',
                attribution: true,
                params: {
                    abi: DROP_ABI as any,
                    to: contractAddress as `0x${string}`,
                    data: txData,
                    value: exactCostWei,
                }
            });
        }

        return new NextResponse(
            getFrameHtmlResponse({
                buttons: [
                    { action: 'tx', label: 'Mint 1', target: `${baseUrl}/api/frame/drop/${contractAddress}/mint` },
                    { action: 'link', label: 'Open mint page', target: `${baseUrl}/drop/base/${contractAddress}` }
                ],
                image: { src: `${baseUrl}/api/og/drop/${contractAddress}` },
                postUrl: `${baseUrl}/api/frame/drop/${contractAddress}/mint`,
            })
        );
    } catch (error) {
        console.error("[Frame Mint] Unhandled error:", error instanceof Error ? error.message : 'Unknown error');
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://droppit.ai';
        return new NextResponse(
            getFrameHtmlResponse({
                buttons: [{ action: 'link', label: 'Open Droppit', target: `${baseUrl}/create` }],
                image: { src: `${baseUrl}/api/og/drop/fallback` },
                postUrl: `${baseUrl}/api/frame/drop/fallback/mint`,
            }),
            { status: 500 }
        );
    }
}
