import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, encodeFunctionData, http, isAddress } from "viem";
import { base, baseSepolia } from "viem/chains";
import { getDropFrameSpec } from "@/lib/drop-frame";
import { getFrameHtmlResponse } from "@/lib/frame-builder";

const isProduction = process.env.NEXT_PUBLIC_ENVIRONMENT === "production";
const activeChain = isProduction ? base : baseSepolia;
const rpcUrlStr = isProduction ? "base-mainnet" : "base-sepolia";

const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const rpcUrl = alchemyKey
    ? `https://${rpcUrlStr}.g.alchemy.com/v2/${alchemyKey}`
    : (isProduction ? "https://mainnet.base.org" : "https://sepolia.base.org");

const DROP_ABI = [
    {
        type: "function",
        name: "mint",
        inputs: [{ name: "quantity", type: "uint256" }],
        stateMutability: "payable",
    },
    { type: "function", name: "mintPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { type: "function", name: "protocolFeePerMint", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { type: "error", name: "IncorrectPayment", inputs: [] },
    { type: "error", name: "SoldOut", inputs: [] },
    { type: "error", name: "InvalidQuantity", inputs: [] },
    { type: "error", name: "ProtocolFeeTransferFailed", inputs: [] },
] as const;

const publicClient = createPublicClient({
    chain: activeChain,
    transport: http(rpcUrl),
});


function getFrameChainId() {
    return process.env.NEXT_PUBLIC_ENVIRONMENT === "production" ? "eip155:8453" : "eip155:84532";
}
function openMintPageFrame(contractAddress: string, frame = getDropFrameSpec(process.env.NEXT_PUBLIC_BASE_URL || "https://droppit.ai", contractAddress)) {
    return getFrameHtmlResponse({
        buttons: [{ action: "link", label: "Open mint page", target: frame.dropUrl }],
        image: { src: frame.ogImageUrl },
        postUrl: frame.mintUrl,
    });
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ contractAddress: string }> }
) {
    try {
        const body = await req.json();
        const resolvedParams = await params;
        const contractAddress = resolvedParams.contractAddress;
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://droppit.ai";
        const frame = getDropFrameSpec(baseUrl, contractAddress);

        if (!contractAddress || !isAddress(contractAddress, { strict: false })) {
            return new NextResponse(openMintPageFrame(contractAddress, frame));
        }

        const trustedData = body?.trustedData;
        const messageBytes = trustedData?.messageBytes;

        if (!trustedData || typeof messageBytes !== "string" || !messageBytes.trim()) {
            console.warn(
                "[Frame Mint] Rejected: Missing or invalid trustedData.messageBytes.",
                { hasTrustedData: !!trustedData, messageBytesType: typeof messageBytes }
            );
            return new NextResponse(openMintPageFrame(contractAddress, frame), { status: 400 });
        }

        const trimmedBytes = messageBytes.trim();
        if (!/^(0x)?[a-fA-F0-9]+$/.test(trimmedBytes) || trimmedBytes.replace(/^0x/, "").length < 2) {
            console.warn(
                "[Frame Mint] Rejected: messageBytes is not valid hex.",
                { length: trimmedBytes.length, prefix: `${trimmedBytes.slice(0, 6)}...` }
            );
            return new NextResponse(openMintPageFrame(contractAddress, frame), { status: 400 });
        }

        let isValid = false;
        const message = { button: 0 };
        try {
            const neynarRes = await fetch("https://api.neynar.com/v2/farcaster/frame/validate", {
                method: "POST",
                headers: { api_key: process.env.NEYNAR_API_KEY || "", "content-type": "application/json" },
                body: JSON.stringify({ message_bytes_in_hex: trimmedBytes }),
            });
            const data = await neynarRes.json();
            isValid = data.valid;
            message.button = data.action?.tapped_button?.index || 0;

            if (!isValid) {
                console.warn("[Frame Mint] Neynar validation failed.", { valid: data.valid, hasAction: !!data.action });
            }
        } catch (error) {
            console.error("[Frame Mint] Neynar validation error:", error instanceof Error ? error.message : "Unknown error");
        }

        if (!isValid) {
            return new NextResponse(openMintPageFrame(contractAddress, frame), { status: 400 });
        }

        let exactCostWei = "0";
        try {
            const [mintPrice, protocolFee] = await Promise.all([
                publicClient.readContract({
                    address: contractAddress as `0x${string}`,
                    abi: DROP_ABI,
                    functionName: "mintPrice",
                }),
                publicClient.readContract({
                    address: contractAddress as `0x${string}`,
                    abi: DROP_ABI,
                    functionName: "protocolFeePerMint",
                }),
            ]);
            exactCostWei = ((mintPrice as bigint) + (protocolFee as bigint)).toString();
        } catch (error) {
            console.error("Failed to read contract data for frame:", error);
            return new NextResponse(openMintPageFrame(contractAddress, frame));
        }

        if (message.button === 1) {
            const txData = encodeFunctionData({
                abi: DROP_ABI,
                functionName: "mint",
                args: [BigInt(1)],
            });

            return NextResponse.json({
                chainId: getFrameChainId(),
                method: "eth_sendTransaction",
                attribution: true,
                params: {
                    abi: DROP_ABI,
                    to: contractAddress as `0x${string}`,
                    data: txData,
                    value: exactCostWei,
                },
            });
        }

        return new NextResponse(
            getFrameHtmlResponse({
                buttons: frame.buttons,
                image: { src: frame.ogImageUrl },
                postUrl: frame.mintUrl,
            })
        );
    } catch (error) {
        console.error("[Frame Mint] Unhandled error:", error instanceof Error ? error.message : "Unknown error");
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://droppit.ai";
        return new NextResponse(
            getFrameHtmlResponse({
                buttons: [{ action: "link", label: "Open Droppit", target: `${baseUrl}/create` }],
                image: { src: `${baseUrl}/api/og/drop/fallback` },
                postUrl: `${baseUrl}/api/frame/drop/fallback/mint`,
            }),
            { status: 500 }
        );
    }
}


