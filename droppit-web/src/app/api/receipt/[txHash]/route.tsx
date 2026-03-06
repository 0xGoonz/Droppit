import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { createPublicClient, formatEther, http, decodeFunctionData } from "viem";
import { base, baseSepolia } from "viem/chains";
import { createClient } from "@supabase/supabase-js";
import { BRAND } from "@/lib/brand";
import { DEFAULT_CHAIN_LABEL, getAlchemyNetworkId, isProductionEnvironment } from "@/lib/chains";
import { OG_BRAND, ogFontFamily } from "@/lib/og-utils";

export const runtime = "edge";

type ReceiptVariant = "square" | "card";
type TxStatus = "success" | "reverted" | "pending";

interface DropMeta {
    title: string;
    image_url: string | null;
    mint_price: string | null;
}

const dropAbi = [
    { type: "function", name: "mint", inputs: [{ type: "uint256", name: "quantity" }] },
    { type: "function", name: "mintTo", inputs: [{ type: "address", name: "recipient" }, { type: "uint256", name: "quantity" }] },
] as const;

const isProduction = isProductionEnvironment();
const activeChain = isProduction ? base : baseSepolia;
const networkLabel = DEFAULT_CHAIN_LABEL;

const alchemyNetwork = getAlchemyNetworkId();
const rpcUrl = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
    ? `https://${alchemyNetwork}.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    : undefined;

const publicClient = createPublicClient({
    chain: activeChain,
    transport: http(rpcUrl),
});

function resolveVariant(req: NextRequest): ReceiptVariant {
    const raw = req.nextUrl.searchParams.get("variant");
    if (raw === "card") return "card";
    return "square"; // default to 1080x1080 square
}

function truncateEnd(value: string, maxChars: number): string {
    if (value.length <= maxChars) return value;
    return `${value.slice(0, Math.max(0, maxChars - 1))}...`;
}

function truncateMiddle(value: string, startChars = 10, endChars = 8): string {
    if (value.length <= startChars + endChars + 3) return value;
    return `${value.slice(0, startChars)}...${value.slice(-endChars)}`;
}

function toGatewayUrl(ipfsOrHttp: string): string {
    if (ipfsOrHttp.startsWith("ipfs://")) {
        return ipfsOrHttp.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
    }
    return ipfsOrHttp;
}

function getStatusUi(status: TxStatus) {
    if (status === "success") {
        return { color: "#16a34a", symbol: "OK", label: "Mint Successful" };
    }
    if (status === "reverted") {
        return { color: "#dc2626", symbol: "X", label: "Transaction Reverted" };
    }
    return { color: "#ca8a04", symbol: "...", label: "Mint Pending" };
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ txHash: string }> }
) {
    try {
        const resolvedParams = await params;
        const rawHash = resolvedParams.txHash.replace(".png", "");
        const hash = rawHash.startsWith("0x") ? rawHash : `0x${rawHash}`;
        const variant = resolveVariant(req);

        const dimensions = variant === "square"
            ? { width: 1080, height: 1080 }
            : { width: 1200, height: 630 };

        let txStatus: TxStatus = "pending";
        let contractAddress: string | null = null;
        let minterAddress: string | null = null;
        let txValue: bigint | null = null;
        let txData: `0x${string}` | null = null;
        let txDate: string | null = null;

        const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Onchain query timeout')), 3500));

        try {
            const receipt = await Promise.race([publicClient.getTransactionReceipt({
                hash: hash as `0x${string}`,
            }), timeoutPromise]);
            txStatus = receipt.status;
            contractAddress = receipt.to?.toLowerCase() ?? null;
            minterAddress = receipt.from?.toLowerCase() ?? null;

            try {
                const block = await Promise.race([publicClient.getBlock({ blockHash: receipt.blockHash }), timeoutPromise]);
                txDate = new Date(Number(block.timestamp) * 1000).toLocaleDateString();
            } catch { }

            try {
                const tx = await Promise.race([publicClient.getTransaction({ hash: hash as `0x${string}` }), timeoutPromise]);
                txValue = tx.value;
                txData = tx.input;
            } catch { }
        } catch {
            try {
                const tx = await Promise.race([publicClient.getTransaction({
                    hash: hash as `0x${string}`,
                }), timeoutPromise]);
                contractAddress = tx.to?.toLowerCase() ?? null;
                minterAddress = tx.from?.toLowerCase() ?? null;
                txValue = tx.value;
                txData = tx.input;
            } catch {
                // keep generic fallback values
            }
        }

        const cacheHeader = txStatus === "success"
            ? "public, max-age=31536000, immutable"
            : "public, max-age=30, stale-while-revalidate=59";

        let drop: DropMeta | null = null;
        if (contractAddress) {
            try {
                const supabase = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                );

                const { data } = await supabase
                    .from("drops")
                    .select("title, image_url, mint_price")
                    .eq("contract_address", contractAddress)
                    .single();

                if (data) drop = data as DropMeta;
            } catch { }
        }

        let quantity = 1;
        if (txData) {
            try {
                const { functionName, args } = decodeFunctionData({ abi: dropAbi, data: txData });
                if (functionName === 'mint' && args?.[0]) quantity = Number(args[0]);
                if (functionName === 'mintTo' && args?.[1]) quantity = Number(args[1]);
            } catch { }
        }

        const title = truncateEnd(drop?.title || "Droppit Drop", variant === "square" ? 54 : 66);
        const shortHash = truncateMiddle(hash, 12, 10);
        const artSrc = drop?.image_url ? toGatewayUrl(drop.image_url) : null;
        const statusUi = getStatusUi(txStatus);

        const totalEth = txValue != null ? formatEther(txValue) : "?";
        const feeStr = `0.0001 ETH / mint`;

        return new ImageResponse(
            (
                <div
                    style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        flexDirection: variant === "square" ? "column" : "row",
                        background:
                            "radial-gradient(circle at top right, rgba(34,211,238,0.18), transparent 45%), radial-gradient(circle at top left, rgba(124,58,237,0.22), transparent 38%), #05070f",
                        color: OG_BRAND.text0,
                        fontFamily: ogFontFamily(),
                        position: "relative",
                        overflow: "hidden",
                    }}
                >
                    {variant === "card" && artSrc && (
                        <div
                            style={{
                                width: 420,
                                height: "100%",
                                padding: "48px 28px 48px 48px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <img
                                alt=""
                                src={artSrc}
                                width={344}
                                height={344}
                                style={{
                                    borderRadius: 24,
                                    border: "2px solid rgba(34,211,238,0.3)",
                                    objectFit: "cover",
                                }}
                            />
                        </div>
                    )}

                    {variant === "square" && artSrc && (
                        <div
                            style={{
                                width: "100%",
                                height: 460,
                                padding: "56px 56px 12px 56px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <img
                                alt=""
                                src={artSrc}
                                width={392}
                                height={392}
                                style={{
                                    borderRadius: 24,
                                    border: "2px solid rgba(34,211,238,0.3)",
                                    objectFit: "cover",
                                }}
                            />
                        </div>
                    )}

                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            padding: variant === "square"
                                ? "18px 64px 56px 64px"
                                : artSrc
                                    ? "56px 64px 48px 0"
                                    : "56px 72px 48px 72px",
                        }}
                    >
                        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                <div
                                    style={{
                                        minWidth: 74,
                                        height: 74,
                                        padding: "0 22px",
                                        borderRadius: 9999,
                                        backgroundColor: statusUi.color,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 26,
                                        fontWeight: 700,
                                    }}
                                >
                                    {statusUi.symbol}
                                </div>
                                <div style={{ fontSize: variant === "square" ? 40 : 36, fontWeight: 800, lineHeight: 1.05 }}>
                                    {statusUi.label}
                                </div>
                            </div>

                            <div
                                style={{
                                    fontSize: variant === "square" ? 50 : 46,
                                    fontWeight: 800,
                                    lineHeight: 1.05,
                                    letterSpacing: "-0.02em",
                                    maxWidth: "100%",
                                }}
                            >
                                {title}
                            </div>

                            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: "45%" }}>
                                    <span style={{ fontSize: 18, color: OG_BRAND.text2 }}>Quantity</span>
                                    <span style={{ fontSize: 22, fontWeight: 600, color: OG_BRAND.text1 }}>{quantity}</span>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: "45%" }}>
                                    <span style={{ fontSize: 18, color: OG_BRAND.text2 }}>Total Cost</span>
                                    <span style={{ fontSize: 22, fontWeight: 600, color: OG_BRAND.text1 }}>{totalEth} ETH</span>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: "45%" }}>
                                    <span style={{ fontSize: 18, color: OG_BRAND.text2 }}>Minter</span>
                                    <span style={{ fontSize: 22, fontWeight: 600, color: OG_BRAND.text1 }}>{minterAddress ? truncateMiddle(minterAddress, 6, 4) : "Unknown"}</span>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: "45%" }}>
                                    <span style={{ fontSize: 18, color: OG_BRAND.text2 }}>Date</span>
                                    <span style={{ fontSize: 22, fontWeight: 600, color: OG_BRAND.text1 }}>{txDate || "Pending"}</span>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: "45%" }}>
                                    <span style={{ fontSize: 18, color: OG_BRAND.text2 }}>Network</span>
                                    <span style={{ fontSize: 22, fontWeight: 600, color: OG_BRAND.text1 }}>{networkLabel}</span>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: "45%" }}>
                                    <span style={{ fontSize: 18, color: OG_BRAND.text2 }}>Fee</span>
                                    <span style={{ fontSize: 22, fontWeight: 600, color: OG_BRAND.text1 }}>{feeStr}</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
                            <div
                                style={{
                                    fontSize: variant === "square" ? 22 : 18,
                                    color: OG_BRAND.text2,
                                    maxWidth: "100%",
                                }}
                            >
                                Tx: {shortHash}
                            </div>
                            <div style={{ fontSize: 16, color: OG_BRAND.text2 }}>
                                Powered by {BRAND.name}
                            </div>
                        </div>
                    </div>
                </div>
            ),
            {
                width: dimensions.width,
                height: dimensions.height,
                headers: {
                    "Cache-Control": cacheHeader,
                },
            }
        );
    } catch (error) {
        console.error("[Receipt OG] Error:", error);
        return new Response("Failed to generate receipt", { status: 500 });
    }
}
