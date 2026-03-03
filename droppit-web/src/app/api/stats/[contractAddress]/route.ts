import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { PROTOCOL_FEE_PER_MINT_WEI } from "@/lib/contracts";
import { createPublicClient, http, isAddress, formatEther, verifyMessage } from "viem";
import { base, baseSepolia } from "viem/chains";

const implementationAbi = [
    { type: "function", name: "totalMinted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { type: "function", name: "protocolFeePerMint", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ contractAddress: string }> }
) {
    try {
        const resolvedParams = await params;
        const rawContract = resolvedParams.contractAddress;
        const body = await req.json();
        const wallet = typeof body.wallet === "string" ? body.wallet.toLowerCase() : null;
        const signature = body.signature;
        const nonce = body.nonce;

        if (!rawContract || !isAddress(rawContract)) {
            return NextResponse.json({ error: "Missing or invalid contract address." }, { status: 400 });
        }

        if (!wallet || !isAddress(wallet)) {
            return NextResponse.json({ error: "Missing or invalid wallet parameter." }, { status: 400 });
        }

        if (!signature || !nonce) {
            return NextResponse.json({ error: "Missing signature challenge. Request a nonce and sign it first." }, { status: 401 });
        }

        const normalizedContract = rawContract.toLowerCase();
        const expectedChainId = process.env.NEXT_PUBLIC_ENVIRONMENT === "production" ? "8453" : "84532";
        const supabaseAdmin = getServiceRoleClient();

        // 1) Resolve drop by canonical contract address
        const { data: drop, error: dropError } = await supabaseAdmin
            .from("drops")
            .select("id, contract_address, creator_address, status, edition_size, mint_price")
            .eq("contract_address", normalizedContract)
            .single();

        if (dropError || !drop) {
            return NextResponse.json({ error: "Drop not found." }, { status: 404 });
        }

        if (!drop.creator_address) {
            return NextResponse.json({ error: "Forbidden: Drop has no creator wallet binding." }, { status: 403 });
        }

        if (drop.creator_address.toLowerCase() !== wallet) {
            return NextResponse.json({ error: "Forbidden: Not the drop creator." }, { status: 403 });
        }

        // 2) Strict nonce verification
        const { data: nonceData, error: nonceError } = await supabaseAdmin
            .from("nonces")
            .select("*")
            .eq("nonce", nonce)
            .maybeSingle();

        if (nonceError || !nonceData) {
            return NextResponse.json({ error: "Invalid or consumed challenge nonce." }, { status: 403 });
        }

        if (nonceData.action !== "stats_read") {
            return NextResponse.json({ error: "Nonce action is invalid for stats access." }, { status: 403 });
        }

        if (nonceData.wallet !== wallet) {
            return NextResponse.json({ error: "Nonce was issued to a different wallet." }, { status: 403 });
        }

        if (nonceData.chain_id !== expectedChainId) {
            return NextResponse.json({ error: "Nonce chain does not match active network." }, { status: 403 });
        }

        const hasDropIdBinding = typeof nonceData.drop_id === "string" && nonceData.drop_id.length > 0;
        const hasContractBinding = typeof nonceData.drop_contract === "string" && nonceData.drop_contract.length > 0;

        if (!hasDropIdBinding && !hasContractBinding) {
            return NextResponse.json({ error: "Nonce is missing required drop binding." }, { status: 403 });
        }

        if (hasDropIdBinding && nonceData.drop_id !== drop.id) {
            return NextResponse.json({ error: "Nonce was issued for a different drop." }, { status: 403 });
        }

        if (hasContractBinding && nonceData.drop_contract !== normalizedContract) {
            return NextResponse.json({ error: "Nonce was issued for a different drop contract." }, { status: 403 });
        }

        if (nonceData.used) {
            return NextResponse.json({ error: "Challenge nonce has already been consumed." }, { status: 403 });
        }

        if (new Date(nonceData.expires_at) < new Date()) {
            return NextResponse.json({ error: "Nonce has expired. Please request a new challenge." }, { status: 403 });
        }

        // 3) Verify exact message contents server-side
        if (
            !nonce.includes(`Action: stats_read`) ||
            !nonce.includes(`Wallet: ${wallet}`) ||
            (!nonce.includes(`Contract: ${normalizedContract}`) && !nonce.includes(`Drop ID: ${drop.id}`)) ||
            !nonce.includes(`Chain ID: ${expectedChainId}`)
        ) {
            return NextResponse.json({ error: "Challenge nonce payload content tampered." }, { status: 403 });
        }

        // 4) Verify signature
        const isValidSignature = await verifyMessage({
            address: wallet as `0x${string}`,
            message: nonce,
            signature: signature as `0x${string}`,
        });

        if (!isValidSignature) {
            return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
        }

        // 5) Atomic nonce burn (anti-replay)
        let burnQuery = supabaseAdmin
            .from("nonces")
            .update({ used: true })
            .eq("id", nonceData.id)
            .eq("nonce", nonce)
            .eq("wallet", wallet)
            .eq("action", "stats_read")
            .eq("chain_id", expectedChainId)
            .eq("used", false)
            .gt("expires_at", new Date().toISOString());

        if (hasDropIdBinding) {
            burnQuery = burnQuery.eq("drop_id", drop.id);
        }

        if (hasContractBinding) {
            burnQuery = burnQuery.eq("drop_contract", normalizedContract);
        }

        const { data: burnedNonce, error: burnError } = await burnQuery.select("id").maybeSingle();

        if (burnError || !burnedNonce) {
            return NextResponse.json({ error: "Challenge nonce has already been consumed." }, { status: 403 });
        }

        // 6) Aggregate stats
        const dropId = drop.id;
        const [viewsRes, mintsRes, uniqueSessionsRes, uniqueWalletsRes, referrersRes] = await Promise.all([
            supabaseAdmin.from("analytics_events").select("id", { count: "exact", head: true }).eq("drop_id", dropId).eq("event", "page_view"),
            supabaseAdmin.from("analytics_events").select("quantity").eq("drop_id", dropId).eq("event", "mint_success"),
            supabaseAdmin.from("analytics_events").select("session_id").eq("drop_id", dropId).eq("event", "page_view").not("session_id", "is", null),
            supabaseAdmin.from("analytics_events").select("wallet").eq("drop_id", dropId).eq("event", "page_view").not("wallet", "is", null),
            supabaseAdmin.from("analytics_events").select("ref_normalized").eq("drop_id", dropId).eq("event", "mint_success").eq("self_ref", false).not("ref_normalized", "is", null),
        ]);

        const totalViews = viewsRes.count || 0;
        let dbTotalMinted = 0;
        if (mintsRes.data) {
            dbTotalMinted = mintsRes.data.reduce((sum, row) => sum + (row.quantity || 0), 0);
        }

        const uniqueSessions = new Set<string>();
        if (uniqueSessionsRes.data) {
            uniqueSessionsRes.data.forEach((row) => {
                if (row.session_id) uniqueSessions.add(row.session_id);
            });
        }
        const uniqueVisitors = uniqueSessions.size;

        const uniqueWallets = new Set<string>();
        if (uniqueWalletsRes.data) {
            uniqueWalletsRes.data.forEach((row) => {
                if (row.wallet) uniqueWallets.add(row.wallet.toLowerCase());
            });
        }

        const referrersCount: Record<string, number> = {};
        if (referrersRes.data) {
            referrersRes.data.forEach((row) => {
                if (row.ref_normalized) {
                    referrersCount[row.ref_normalized] = (referrersCount[row.ref_normalized] || 0) + 1;
                }
            });
        }

        const topReferrers = Object.entries(referrersCount)
            .map(([ref, count]) => ({ ref, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // 7) Onchain stats (live)
        let actualTotalMinted = dbTotalMinted;
        let protocolFeePerMintStr = PROTOCOL_FEE_PER_MINT_WEI.toString();

        if (drop.status === "LIVE" && drop.contract_address && isAddress(drop.contract_address)) {
            const chain = process.env.NEXT_PUBLIC_ENVIRONMENT === "sandbox" ? baseSepolia : base;
            const alchemyNetwork = process.env.NEXT_PUBLIC_ENVIRONMENT === "sandbox" ? "base-sepolia" : "base-mainnet";
            const rpcUrl = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
                ? `https://${alchemyNetwork}.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
                : undefined;

            const publicClient = createPublicClient({
                chain,
                transport: http(rpcUrl),
            });

            try {
                const [onchainMinted, onchainFee] = await Promise.all([
                    publicClient.readContract({
                        address: drop.contract_address as `0x${string}`,
                        abi: implementationAbi,
                        functionName: "totalMinted",
                    }).catch(() => BigInt(dbTotalMinted)),
                    publicClient.readContract({
                        address: drop.contract_address as `0x${string}`,
                        abi: implementationAbi,
                        functionName: "protocolFeePerMint",
                    }).catch(() => PROTOCOL_FEE_PER_MINT_WEI),
                ]);

                actualTotalMinted = Number(onchainMinted);
                protocolFeePerMintStr = onchainFee.toString();
            } catch (error) {
                console.warn("Failed reading onchain stats:", error);
            }
        }

        // 8) Revenue
        const mintPriceBigInt = BigInt(drop.mint_price || "0");
        const protocolFeeBigInt = BigInt(protocolFeePerMintStr);
        const mintedBigInt = BigInt(actualTotalMinted);
        const creatorRevenueWei = mintPriceBigInt * mintedBigInt;
        const protocolRevenueWei = protocolFeeBigInt * mintedBigInt;

        // 9) Response
        return NextResponse.json({
            drop: {
                id: dropId,
                status: drop.status,
                contractAddress: drop.contract_address,
                editionSize: drop.edition_size,
                mintPriceEth: formatEther(mintPriceBigInt),
            },
            traffic: {
                totalViews,
                uniqueVisitors,
                uniqueConnectedWallets: uniqueWallets.size,
                conversionRate: uniqueVisitors > 0 ? (actualTotalMinted / uniqueVisitors) * 100 : 0,
            },
            supply: {
                totalMinted: actualTotalMinted,
                remaining: Math.max(0, drop.edition_size - actualTotalMinted),
                editionSize: drop.edition_size,
            },
            revenue: {
                creatorRevenueEth: formatEther(creatorRevenueWei),
                protocolRevenueEth: formatEther(protocolRevenueWei),
            },
            referrers: topReferrers,
        });
    } catch (error) {
        console.error("[Stats API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
