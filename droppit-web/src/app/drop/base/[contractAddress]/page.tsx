"use client";

import React, { useState } from "react";
import Link from "next/link";
import { formatEther, isAddress } from "viem";
import { useReadContracts, useAccount, useDisconnect, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useSignMessage, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import {
    ConnectWallet,
    Wallet,
    WalletDropdown,
} from '@coinbase/onchainkit/wallet';
import {
    Avatar,
    Name,
    Identity,
    Address,
    EthBalance
} from '@coinbase/onchainkit/identity';
import { createClient } from "@supabase/supabase-js";
import { useChainPreference } from "@/providers/OnchainKitProvider";
import { PROTOCOL_FEE_PER_MINT_WEI, hasChainContractConfig } from "@/lib/contracts";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { formatMintPriceWei, normalizeIpfsToHttp } from "@/lib/og-utils";
import { buildDropShareCaption, buildWarpcastComposeHref } from "@/lib/drop-sharing";
import {
    type ReferralPayload,
    normalizeReferralPayloadFromSearchParams,
    serializeUtm,
} from "@/lib/attribution";
import { trackEvent } from "@/lib/analytics";
import {
    getSessionStorageSafe,
    hasSelectedChainMismatch,
    shouldShowMiniAppConnectingState,
    suppressMiniAppAutoConnect,
} from "@/lib/miniapp-wallet";
// Minimal Drop1155 ABI for reads and writes
const dropAbi = [
    { type: 'function', name: 'editionSize', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'mintPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'totalMinted', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'protocolFeePerMint', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
    { type: 'function', name: 'uri', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ type: 'string' }] },
    { type: 'function', name: 'mint', stateMutability: 'payable', inputs: [{ name: 'quantity', type: 'uint256' }], outputs: [] },
    { type: 'function', name: 'mintTo', stateMutability: 'payable', inputs: [{ name: 'to', type: 'address' }, { name: 'quantity', type: 'uint256' }], outputs: [] },
    { type: 'function', name: 'factory', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
    { type: 'function', name: 'lockedContentCommitment', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] }
] as const;

// Minimal Factory ABI for implementation resolution
const factoryAbi = [
    { type: 'function', name: 'implementation', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }
] as const;

function normalizeFarcasterHandle(raw: string): string {
    return raw.trim().replace(/^@+/, "").toLowerCase();
}

function shortAddress(raw: string): string {
    if (!raw || raw.length < 10) return raw;
    return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

export default function MintPage({ params }: { params: Promise<{ contractAddress: string }> }) {
    const { contractAddress } = React.use(params);
    const { address: userAddress, chainId } = useAccount();
    const {
        selectedChain,
        selectedChainId,
        setSelectedChainId,
        hasSelectedChainContractConfig,
        isMiniAppEnvironment,
        isMiniAppWalletBootstrapping,
    } = useChainPreference();
    const explorerUrl = selectedChain.blockExplorers?.default.url || "https://basescan.org";
    const isMintEnabledForSelectedChain = hasSelectedChainContractConfig && hasChainContractConfig(selectedChain.id);

    const [isMinting, setIsMinting] = useState(false);
    const [hasMinted, setHasMinted] = useState(false);
    const [copied, setCopied] = useState(false);
    const [copiedTrustKey, setCopiedTrustKey] = useState<string | null>(null);
    const [isLockedContentCopied, setIsLockedContentCopied] = useState(false);
    const [lockedContentData, setLockedContentData] = useState<string | null>(null);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [unlockError, setUnlockError] = useState<string | null>(null);
    const [isContentUnlocked, setIsContentUnlocked] = useState(false);
    const [referralPayload, setReferralPayload] = useState<ReferralPayload>({ ref: null, utm: {} });
    const [isReferralReady, setIsReferralReady] = useState(false);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const hasTrackedViewRef = React.useRef(false);
    const trackedMintSessionKeysRef = React.useRef<Set<string>>(new Set());

    // MVP Mint Features
    const [quantity, setQuantity] = useState<number>(1);
    const [isGifting, setIsGifting] = useState<boolean>(false);
    const [recipient, setRecipient] = useState<string>("");
    const [recipientError, setRecipientError] = useState<string | null>(null);

    // Write Hooks
    const { data: hash, writeContractAsync, isPending } = useWriteContract();
    const { switchChainAsync } = useSwitchChain();
    const { disconnect } = useDisconnect();
    const [isSwitchingChain, setIsSwitchingChain] = useState(false);
    const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });
    const { signMessageAsync } = useSignMessage();
    const hasConnectedWallet = Boolean(userAddress);
    const showMiniAppWalletConnecting = shouldShowMiniAppConnectingState({
        isMiniAppEnvironment,
        isMiniAppWalletBootstrapping,
        hasConnectedWallet,
    });
    const shouldPromptForChainSwitch = hasSelectedChainMismatch({
        hasConnectedWallet,
        walletChainId: chainId,
        selectedChainId: selectedChain.id,
    });
    const handleWalletDisconnect = React.useCallback(() => {
        suppressMiniAppAutoConnect(getSessionStorageSafe());
        disconnect();
    }, [disconnect]);
    const handleSwitchToSelectedChain = React.useCallback(async () => {
        setIsSwitchingChain(true);
        try {
            await switchChainAsync({ chainId: selectedChain.id });
        } catch (error) {
            const message = error instanceof Error ? error.message : `Switch to ${selectedChain.name} to continue.`;
            alert(message);
        } finally {
            setIsSwitchingChain(false);
        }
    }, [selectedChain, switchChainAsync]);

    // Fetch Onchain Data
    const { data, isLoading, isError, refetch } = useReadContracts({
        contracts: [
            { address: contractAddress as `0x${string}`, abi: dropAbi, functionName: 'editionSize' },
            { address: contractAddress as `0x${string}`, abi: dropAbi, functionName: 'mintPrice' },
            { address: contractAddress as `0x${string}`, abi: dropAbi, functionName: 'totalMinted' },
            { address: contractAddress as `0x${string}`, abi: dropAbi, functionName: 'owner' },
            { address: contractAddress as `0x${string}`, abi: dropAbi, functionName: 'uri', args: [BigInt(1)] },
            { address: contractAddress as `0x${string}`, abi: dropAbi, functionName: 'protocolFeePerMint' },
            { address: contractAddress as `0x${string}`, abi: dropAbi, functionName: 'factory' },
            { address: contractAddress as `0x${string}`, abi: dropAbi, functionName: 'lockedContentCommitment' },
        ],
    });

    // Parse Data safely
    const supply = data?.[0].result?.toString() || "0";
    const rawPrice = (data?.[1].result as bigint) || BigInt(0);
    const priceEth = formatEther(rawPrice);
    const minted = data?.[2].result?.toString() || "0";
    const creatorAddress = (data?.[3].result as string) || "";
    const hasCreatorAddress = creatorAddress.startsWith("0x") && creatorAddress.length === 42;
    const tokenUri = (data?.[4].result as string) || "";
    const rawProtocolFee = (data?.[5].result as bigint) || PROTOCOL_FEE_PER_MINT_WEI;
    const factoryAddress = (data?.[6].result as string) || null;
    const lockedCommitment = (data?.[7].result as string) || null;
    const hasOnchainCommitment = lockedCommitment && lockedCommitment !== "0x0000000000000000000000000000000000000000000000000000000000000000";

    // Fetch implementation from the resolved factory
    const { data: factoryData, isLoading: isLoadingFactory, isError: isErrorFactory } = useReadContracts({
        contracts: factoryAddress ? [
            { address: factoryAddress as `0x${string}`, abi: factoryAbi, functionName: 'implementation' }
        ] : [],
        query: { enabled: !!factoryAddress }
    });

    const implementationAddress = (factoryData?.[0]?.result as string) || null;

    const supplyNum = Number(supply);
    const mintedNum = Number(minted);
    const remaining = supplyNum - mintedNum;
    const maxSelectable = Math.min(5, Math.max(0, remaining));
    const isSoldOut = !isLoading && supplyNum > 0 && remaining <= 0;
    const isCreatorViewer = !!userAddress && hasCreatorAddress && userAddress.toLowerCase() === creatorAddress.toLowerCase();

    const { data: ensName, isLoading: isLoadingEns, isError: isErrorEns } = useEnsName({
        address: hasCreatorAddress ? (creatorAddress as `0x${string}`) : undefined,
        chainId: mainnet.id,
        query: { enabled: hasCreatorAddress },
    });

    React.useEffect(() => {
        // Clamp quantity if the user somehow has more selected than remaining/allowed
        if (!isLoading && maxSelectable > 0) {
            setQuantity(prev => Math.min(prev, maxSelectable));
        }
    }, [isLoading, maxSelectable]);

    React.useEffect(() => {
        if (typeof window !== "undefined") {
            const searchParams = new URLSearchParams(window.location.search);
            const parsed = normalizeReferralPayloadFromSearchParams(searchParams);
            setReferralPayload(parsed);

            if (searchParams.get("gift") === "true") {
                setIsGifting(true);
            }
        }
        setIsReferralReady(true);
    }, []);

    React.useEffect(() => {
        if (hasTrackedViewRef.current || !isReferralReady) return;
        if (typeof window === "undefined") return;

        const dropKey = contractAddress.toLowerCase();
        const refKey = referralPayload.ref ? referralPayload.ref.toLowerCase() : "none";
        const sessionStorageKey = `attribution:view:${dropKey}:${refKey}`;
        const dedupeKey = `view:${dropKey}:${refKey}:${serializeUtm(referralPayload.utm)}`;

        if (sessionStorage.getItem(sessionStorageKey)) {
            hasTrackedViewRef.current = true;
            return;
        }

        hasTrackedViewRef.current = true;
        sessionStorage.setItem(sessionStorageKey, dedupeKey);

        void fetch('/api/attribution/view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contractAddress: dropKey,
                wallet: userAddress || null,
                referral: referralPayload,
                dedupeKey,
                metadata: isGifting ? { gift: true } : undefined,
            }),
        }).catch((error) => {
            console.error("Attribution view event failed:", error);
        });
    }, [contractAddress, isReferralReady, referralPayload, userAddress, isGifting]);

    const [metadata, setMetadata] = useState<{ name?: string; description?: string; image?: string } | null>(null);

    // Fetch Metadata from IPFS
    React.useEffect(() => {
        if (!tokenUri) return;
        const fetchMetadata = async () => {
            try {
                const url = normalizeIpfsToHttp(tokenUri);
                if (!url) return;

                const response = await fetch(url);
                const json = await response.json();
                setMetadata(json);
            } catch (err) {
                console.error("Failed to fetch metadata:", err);
            }
        };
        fetchMetadata();
    }, [tokenUri]);

    const drop = {
        title: metadata?.name || (isLoading ? "Loading Drop..." : "Unknown Drop"),
        description: metadata?.description || (isLoading ? "..." : "No description provided."),
        image: normalizeIpfsToHttp(metadata?.image) || null,
    };
    const canAttemptUnlock = !!userAddress && !!tokenUri;
    const appOrigin = typeof window !== "undefined"
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_BASE_URL || "https://droppit.ai");
    const shareHref = new URL(`/s/${contractAddress}`, appOrigin).toString();
    const receiptHref = receipt?.transactionHash ? `/r/receipt/${receipt.transactionHash}` : null;
    const absoluteReceiptUrl = receiptHref ? new URL(receiptHref, appOrigin).toString() : null;
    const metadataFrozenLabel = isLoading
        ? "Loading..."
        : isError
            ? "Unavailable"
            : tokenUri
                ? "Yes"
                : "Unknown";
    const metadataFrozenHint = isLoading
        ? "Reading onchain metadata capability"
        : isError
            ? "Unable to verify onchain metadata immutability"
            : tokenUri
                ? "Drop1155 stores token URI at initialization with no setter"
                : "Token URI is not available";

    const handleUnlockContent = React.useCallback(async () => {
        if (!userAddress) {
            setUnlockError("Connect your wallet to unlock content.");
            return;
        }
        if (!tokenUri) {
            setUnlockError("Drop metadata is still loading. Please try again.");
            return;
        }

        setIsUnlocking(true);
        setUnlockError(null);

        try {
            const nonceRes = await fetch('/api/drop/locked/nonce', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet: userAddress, dropContract: contractAddress })
            });
            const noncePayload = await nonceRes.json().catch(() => ({} as { nonce?: string; error?: string }));
            if (!nonceRes.ok || !noncePayload?.nonce) {
                throw new Error(noncePayload?.error || "Could not fetch challenge nonce.");
            }

            const signature = await signMessageAsync({ message: noncePayload.nonce });

            const contentRes = await fetch('/api/drop/locked', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tokenUri, userAddress, contractAddress, signature, nonce: noncePayload.nonce })
            });
            const contentPayload = await contentRes.json().catch(() => ({} as { lockedContent?: string; error?: string }));
            if (!contentRes.ok) {
                throw new Error(contentPayload?.error || "Failed to unlock content.");
            }
            if (!contentPayload?.lockedContent) {
                throw new Error("No locked content is available for this drop.");
            }

            setLockedContentData(contentPayload.lockedContent);
            setIsContentUnlocked(true);
            setUnlockError(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to unlock content.";
            setUnlockError(message);
            console.error("Failed to fetch locked content:", err);
        } finally {
            setIsUnlocking(false);
        }
    }, [userAddress, tokenUri, contractAddress, signMessageAsync]);

    // Watch for successful transaction
    React.useEffect(() => {
        if (isSuccess && receipt) {
            setIsMinting(false);
            setHasMinted(true);
            refetch(); // Refresh the minted count dynamically

            // Item 22: Track mint success event
            trackEvent("mint_success", {
                contract_address: contractAddress,
                quantity,
                wallet: userAddress,
                tx_hash: receipt.transactionHash,
            });

            // Auto-attempt unlock after a successful mint.
            // Unlock state remains independent from mint state.
            if (canAttemptUnlock && !isContentUnlocked) {
                void handleUnlockContent();
            }
        }
    }, [isSuccess, receipt, refetch, canAttemptUnlock, isContentUnlocked, handleUnlockContent]);

    React.useEffect(() => {
        if (!isSuccess || !receipt) return;
        if (typeof window === "undefined") return;

        const txHash = receipt.transactionHash;
        if (!txHash) return;

        const dropKey = contractAddress.toLowerCase();
        const walletKey = userAddress ? userAddress.toLowerCase() : "anonymous";
        const sessionStorageKey = `attribution:mint:${dropKey}:${txHash.toLowerCase()}:${walletKey}`;
        const dedupeKey = `mint:${txHash.toLowerCase()}:${walletKey}:${dropKey}`;

        if (trackedMintSessionKeysRef.current.has(sessionStorageKey)) return;
        if (sessionStorage.getItem(sessionStorageKey)) {
            trackedMintSessionKeysRef.current.add(sessionStorageKey);
            return;
        }

        trackedMintSessionKeysRef.current.add(sessionStorageKey);
        sessionStorage.setItem(sessionStorageKey, dedupeKey);

        void fetch('/api/attribution/mint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contractAddress: dropKey,
                quantity,
                txHash,
                wallet: userAddress || null,
                referral: referralPayload,
                dedupeKey,
                metadata: isGifting ? { gift: true } : undefined,
            }),
        }).catch((error) => {
            console.error("Attribution mint event failed:", error);
        });
    }, [isSuccess, receipt, contractAddress, quantity, userAddress, referralPayload, isGifting]);

    const [creatorIdentity, setCreatorIdentity] = useState<{ handle: string; fid: number | null } | null>(null);
    const [isLoadingCreatorIdentity, setIsLoadingCreatorIdentity] = useState(false);
    const [creatorIdentityError, setCreatorIdentityError] = useState<string | null>(null);

    // Fetch Optional Identity Link
    React.useEffect(() => {
        if (!hasCreatorAddress) return;

        const fetchIdentity = async () => {
            setIsLoadingCreatorIdentity(true);
            setCreatorIdentityError(null);
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );
            const { data, error } = await supabase
                .from('identity_links')
                .select('handle, fid')
                .eq('creator_address', creatorAddress.toLowerCase())
                .order('verified_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error && error.code !== "PGRST116") {
                setCreatorIdentityError("Unable to load linked identity.");
            } else if (data?.handle) {
                setCreatorIdentity({
                    handle: normalizeFarcasterHandle(data.handle),
                    fid: data.fid ?? null,
                });
            } else {
                setCreatorIdentity(null);
            }
            setIsLoadingCreatorIdentity(false);
        };
        void fetchIdentity();
    }, [creatorAddress, hasCreatorAddress]);

    const farcasterHandle = creatorIdentity?.handle ?? null;
    const creatorDisplay = farcasterHandle ? `@${farcasterHandle}` : (ensName || shortAddress(creatorAddress || "Unknown creator"));
    const creatorProfileHref = farcasterHandle
        ? `https://warpcast.com/${farcasterHandle}`
        : null;
    const creatorExplorerHref = hasCreatorAddress ? `${explorerUrl}/address/${creatorAddress}` : null;
    const sharePriceLabel = formatMintPriceWei(rawPrice.toString());
    const creatorShareCaption = buildDropShareCaption({
        title: drop.title,
        priceLabel: sharePriceLabel,
        chainLabel: selectedChain.name,
        creatorHandle: farcasterHandle,
        intro: `"${drop.title}" is live on @droppit.`,
        cta: "Collect:",
    });
    const creatorShareComposeHref = buildWarpcastComposeHref({
        text: creatorShareCaption,
        embedUrl: shareHref,
    });
    const collectorShareCaption = buildDropShareCaption({
        title: drop.title,
        priceLabel: sharePriceLabel,
        chainLabel: selectedChain.name,
        creatorHandle: farcasterHandle,
        intro: `I just collected "${drop.title}" on @droppit.`,
        cta: "Check it out:",
    });
    const collectorShareComposeHref = buildWarpcastComposeHref({
        text: collectorShareCaption,
        embedUrl: shareHref,
    });

    const handleMint = async () => {
        if (isSoldOut) return alert("This drop is sold out.");
        if (!userAddress) return alert("Please connect your wallet first.");
        if (!isMintEnabledForSelectedChain) return alert(`Minting is disabled: ${selectedChain.name} contract configuration is missing.`);

        setRecipientError(null);
        let normalizedRecipient: `0x${string}` | null = null;
        if (isGifting) {
            const trimmedRecipient = recipient.trim();
            if (!trimmedRecipient) {
                setRecipientError("Recipient address is required for gifting.");
                return;
            }
            if (!isAddress(trimmedRecipient)) {
                setRecipientError("Enter a valid EVM address (0x...).");
                return;
            }
            normalizedRecipient = trimmedRecipient as `0x${string}`;
        }

        try {
            if (chainId !== selectedChain.id) {
                throw new Error(`Switch to ${selectedChain.name} to mint.`);
            }

            setIsMinting(true);
            // Item 22: Track mint click event
            trackEvent("mint_click", {
                contract_address: contractAddress,
                quantity,
                wallet: userAddress,
                is_gift: isGifting,
            });

            // Calculate total exact payment (mintPrice + protocolFeePerMint) * quantity
            const totalValueRequired = (rawPrice + rawProtocolFee) * BigInt(quantity);

            if (isGifting && normalizedRecipient) {
                await writeContractAsync({
                    chainId: selectedChain.id,
                    address: contractAddress as `0x${string}`,
                    abi: dropAbi,
                    functionName: 'mintTo',
                    args: [normalizedRecipient, BigInt(quantity)],
                    value: totalValueRequired
                });
            } else {
                await writeContractAsync({
                    chainId: selectedChain.id,
                    address: contractAddress as `0x${string}`,
                    abi: dropAbi,
                    functionName: 'mint',
                    args: [BigInt(quantity)],
                    value: totalValueRequired
                });
            }

        } catch (e: unknown) {
            console.error("Minting failed", e);
            const message = e instanceof Error ? e.message : "Minting transaction failed";
            alert(message);
            setIsMinting(false);
        }
    };

    const handleShare = async () => {
        try {
            await navigator.clipboard.writeText(shareHref);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy link", err);
        }
    };

    const handleCopyTrustValue = React.useCallback(async (value: string, key: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedTrustKey(key);
            setTimeout(() => {
                setCopiedTrustKey((prev) => (prev === key ? null : prev));
            }, 1600);
        } catch (err) {
            console.error("Failed to copy trust datum", err);
        }
    }, []);

    const handleCopyLockedContent = React.useCallback(async () => {
        if (!lockedContentData) return;
        try {
            await navigator.clipboard.writeText(lockedContentData);
            setIsLockedContentCopied(true);
            setTimeout(() => setIsLockedContentCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy locked content", err);
        }
    }, [lockedContentData]);

    if (!isLoading && (isError || (!factoryAddress && !isErrorFactory))) {
        return (
            <div className="min-h-screen bg-[#05070f] flex flex-col items-center justify-center p-4">
                <BrandLockup markSize={42} wordmarkClassName="text-3xl font-bold mb-8" />
                <div className="text-center bg-white/[0.02] border border-white/[0.05] p-12 rounded-3xl max-w-md w-full shadow-2xl backdrop-blur-xl">
                    <div className="flex justify-center mb-6 text-slate-500">
                        <svg viewBox="0 0 24 24" className="h-16 w-16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-3">Drop Not Found</h1>
                    <p className="text-slate-400 text-sm mb-8 leading-relaxed">The contract address provided is invalid, does not exist on {selectedChain.name}, or there was an error communicating with the blockchain.</p>
                    <Link href="/" className="inline-block px-8 py-3 rounded-full bg-white text-black font-bold hover:scale-105 transition-transform">Return Home</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="relative min-h-screen bg-[#05070f] text-white selection:bg-[#0052FF]/40 selection:text-white pb-20 overflow-hidden">
            <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_20%_0%,rgba(0,82,255,0.16),transparent_34%),radial-gradient(circle_at_80%_0%,rgba(34,211,238,0.14),transparent_32%),radial-gradient(circle_at_65%_85%,rgba(124,58,237,0.12),transparent_36%)]" />
            <nav className="relative z-20 flex items-center justify-between px-4 py-5 sm:px-6 lg:px-8 max-w-6xl mx-auto">
                <BrandLockup markSize={28} wordmarkClassName="text-xl font-bold tracking-tight" />
                <div className="flex items-center gap-3">
                    <Link
                        href="/create"
                        className="hidden sm:inline-flex lift-hover rounded-full border border-[#22D3EE]/40 bg-[#0052FF]/20 px-4 py-2 text-sm font-semibold text-blue-100 transition-colors hover:bg-[#0052FF]/35"
                    >
                        Start a Drop
                    </Link>
                    <div className="hidden md:flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs font-mono text-slate-400">
                        <div className="h-2 w-2 rounded-full bg-[#22D3EE] animate-pulse" />
                        {selectedChain.name}
                    </div>

                    <Wallet>
                        <ConnectWallet className="rounded-full border border-[#0052FF]/25 bg-gradient-to-r from-[#0052FF]/15 to-[#22D3EE]/10 px-3 py-2 text-white !min-w-0 text-sm font-medium transition-all hover:from-[#0052FF]/25 hover:to-[#22D3EE]/20 hover:border-[#0052FF]/40 hover:shadow-[0_0_20px_rgba(0,82,255,0.15)]">
                            <Avatar className="h-7 w-7 ring-2 ring-[#0052FF]/30" />
                        </ConnectWallet>
                        <WalletDropdown className="border border-white/[0.08] bg-[#0B1020] rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                            <Identity className="px-4 pt-4 pb-2 text-white hover:bg-white/[0.03] transition-colors" hasCopyAddressOnClick>
                                <Avatar className="h-10 w-10 ring-2 ring-[#0052FF]/40" />
                                <Name className="text-white font-bold" />
                                <Address className="text-slate-400 font-mono text-sm" />
                                <EthBalance className="text-[#22D3EE] font-bold" />
                            </Identity>
                            <div className="h-px bg-white/[0.06] w-full" />
                            <button type="button" onClick={handleWalletDisconnect} className="text-red-400 hover:bg-red-500/10 transition-colors w-full flex items-center justify-center py-3 font-semibold">
                                Disconnect
                            </button>
                        </WalletDropdown>
                    </Wallet>
                </div>
            </nav>

            <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-12 grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Left: Artwork */}
                <div
                    className={`relative w-full max-w-lg mx-auto lg:mx-0 rounded-3xl overflow-hidden border border-white/[0.06] shadow-[0_0_50px_rgba(0,82,255,0.1)] bg-white/[0.02] group cursor-pointer self-start lg:sticky lg:top-24 ${drop.image ? '' : 'aspect-square'}`}
                    onClick={() => drop.image && setIsLightboxOpen(true)}
                >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10 pointer-events-none" />

                    {drop.image ? (
                        <img src={drop.image} alt={drop.title} className="w-full h-auto object-contain object-center group-hover:scale-105 transition-transform duration-700 block relative z-0 m-auto" />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center z-0">
                            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[#0052FF]/20 bg-[#0052FF]/8 text-[#22D3EE]">
                                <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                            </div>
                        </div>
                    )}

                    <div className="absolute bottom-6 left-6 z-20 flex items-center gap-2">
                        <div className="text-xs font-mono text-[#22D3EE] bg-[#0052FF]/10 px-2.5 py-1 rounded-lg inline-block backdrop-blur-md border border-[#0052FF]/20">
                            ERC-1155
                        </div>
                        {drop.image && (
                            <div className="text-xs text-slate-400 bg-black/40 px-2.5 py-1 rounded-lg backdrop-blur-md border border-white/[0.06] opacity-0 group-hover:opacity-100 transition-opacity">
                                Click to expand
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Info & Minting */}
                <div className="flex flex-col justify-center">
                    <div className="mb-8">
                        <h1 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-tight">
                            {isLoading ? "Loading Drop..." : drop.title}
                        </h1>
                        <div className="flex items-center gap-3 text-sm text-slate-400 mb-6 flex-wrap">
                            <span className="font-mono rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-slate-300 flex items-center">
                                Created by {isLoading ? "Loading..." : creatorDisplay}
                            </span>
                            {hasOnchainCommitment && (
                                <span title="A cryptographic commitment to the locked content is recorded onchain proving it exists" className="font-mono rounded-lg border border-[#16a34a]/30 bg-[#16a34a]/10 px-2.5 py-1 text-[#4ade80] flex items-center gap-1.5 cursor-help">
                                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                                    Commitment verified
                                </span>
                            )}
                            {isCreatorViewer && (
                                <Link
                                    href={`/drop/base/${contractAddress}/stats`}
                                    className="font-mono rounded-lg border border-[#0052FF]/20 bg-[#0052FF]/10 px-2.5 py-1 text-[#22D3EE] hover:bg-[#0052FF]/20 transition-colors flex items-center"
                                >
                                    View Stats
                                </Link>
                            )}
                        </div>
                        <p className="text-slate-400 leading-relaxed text-lg">{drop.description}</p>
                    </div>

                    <div className="rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-6 mb-8 backdrop-blur-sm">
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <p className="text-sm text-slate-500 mb-1">Price</p>
                                {Number(priceEth) === 0 ? (
                                    <p className="text-2xl font-bold text-[#22D3EE]">Free mint</p>
                                ) : (
                                    <p className="text-2xl font-bold text-white">{priceEth} ETH</p>
                                )}
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 mb-1">Minted</p>
                                <p className="text-2xl font-bold text-white">
                                    {minted} <span className="text-slate-600 text-lg">/ {supply}</span>
                                </p>
                            </div>
                        </div>

                        {/* Quantity & Gifting Options */}
                        <div className="space-y-4 mb-6">
                            <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                                <span className="text-slate-300 font-medium">Quantity</span>
                                <div className="flex items-center gap-4 rounded-full border border-white/[0.06] bg-[#05070f]/60 px-2 py-1">
                                    <button
                                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] font-bold transition-all hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={quantity <= 1 || isSoldOut}
                                    >-</button>
                                    <span className="font-mono w-4 text-center">{quantity}</span>
                                    <button
                                        onClick={() => setQuantity(Math.min(maxSelectable, quantity + 1))}
                                        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] font-bold transition-all hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={quantity >= maxSelectable || isSoldOut}
                                    >+</button>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isGifting}
                                        onChange={(e) => {
                                            const nextValue = e.target.checked;
                                            setIsGifting(nextValue);
                                            if (!nextValue) setRecipientError(null);
                                        }}
                                        className="w-5 h-5 rounded border-white/20 bg-[#05070f]/50 text-[#0052FF] focus:ring-[#0052FF] focus:ring-offset-[#05070f]"
                                    />
                                    <span className="text-slate-300 font-medium">Mint as Gift</span>
                                </label>
                                {isGifting && (
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            placeholder="Recipient Address (0x...)"
                                            value={recipient}
                                            onChange={(e) => {
                                                const nextRecipient = e.target.value;
                                                setRecipient(nextRecipient);
                                                if (!recipientError) return;
                                                const normalized = nextRecipient.trim();
                                                if (!normalized) {
                                                    setRecipientError("Recipient address is required for gifting.");
                                                    return;
                                                }
                                                if (!isAddress(normalized)) {
                                                    setRecipientError("Enter a valid EVM address (0x...).");
                                                    return;
                                                }
                                                setRecipientError(null);
                                            }}
                                            onBlur={() => setRecipient((prev) => prev.trim())}
                                            className={`w-full rounded-xl border bg-white/[0.02] px-4 py-3 text-white text-sm focus:outline-none transition-all ${recipientError
                                                ? "border-red-500/70 focus:border-red-400"
                                                : "border-white/[0.08] focus:border-[#0052FF]/50 focus:shadow-[0_0_0_3px_rgba(0,82,255,0.1)]"
                                                }`}
                                        />
                                        {recipientError && (
                                            <p className="text-xs text-red-300">{recipientError}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Price Breakdown (Before confirmation) */}
                        {!isLoading && (
                            <div className="mb-4 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] space-y-2">
                                <div className="flex justify-between text-slate-400 text-sm">
                                    <span>Mint price</span>
                                    <span className="font-mono">{Number(priceEth) === 0 ? "Free mint" : `${priceEth} ETH`}</span>
                                </div>
                                <div className="flex justify-between text-slate-400 text-sm">
                                    <span>Protocol fee</span>
                                    <span className="font-mono">{formatEther(rawProtocolFee)} ETH</span>
                                </div>
                                {quantity > 1 && (
                                    <div className="flex justify-between text-white text-sm">
                                        <span>Subtotal (1 qty)</span>
                                        <span className="font-mono">{formatEther(rawPrice + rawProtocolFee)} ETH</span>
                                    </div>
                                )}
                                <div className="h-px bg-white/[0.06] my-2" />
                                <div className="flex justify-between items-center text-white">
                                    <span className="font-bold">Total {quantity > 1 ? `(× ${quantity})` : ""}</span>
                                    <span className="font-mono text-lg font-bold text-[#22D3EE]">
                                        {formatEther((rawPrice + rawProtocolFee) * BigInt(quantity))} ETH
                                    </span>
                                </div>
                            </div>
                        )}

                        {!isMintEnabledForSelectedChain && (
                            <div className="mb-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-xs font-mono">
                                Minting is disabled for {selectedChain.name}: missing chain contract configuration.
                            </div>
                        )}

                        {hasMinted && receiptHref && receipt ? (
                            <div className="mb-4 p-5 rounded-3xl border border-green-500/30 bg-green-500/10 flex flex-col gap-4 animate-in fade-in slide-in-from-top-4">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                                        <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <h3 className="text-green-400 font-bold text-lg">Mint Successful!</h3>
                                    <p className="text-green-400/80 text-sm mt-1">Your drop is now in your wallet.</p>
                                </div>

                                <div className="grid grid-cols-2 gap-3 mt-2">
                                    <a
                                        href={receiptHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-sm font-semibold transition-colors"
                                    >
                                        🧾 View Receipt
                                    </a>
                                    <a
                                        href={`${explorerUrl}/tx/${receipt.transactionHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-sm font-semibold transition-colors text-slate-300"
                                    >
                                        🔍 Explorer
                                    </a>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <a
                                        href={collectorShareComposeHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#8A63D2]/20 hover:bg-[#8A63D2]/30 border border-[#8A63D2]/40 text-[#8A63D2] text-sm font-semibold transition-colors"
                                    >
                                        Farcaster
                                    </a>
                                    <a
                                        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just collected "${drop.title}" on Droppit!\n\nView my receipt:\n${absoluteReceiptUrl ?? receiptHref}`)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-sm font-semibold transition-colors"
                                    >
                                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg> Post
                                    </a>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {showMiniAppWalletConnecting && (
                                    <div className="rounded-xl border border-[#22D3EE]/25 bg-[#22D3EE]/10 px-4 py-3 text-sm font-semibold text-[#9FEAF8]">
                                        Connecting wallet...
                                    </div>
                                )}
                                {shouldPromptForChainSwitch && (
                                    <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                        <p>Connected wallet is on the wrong network. Switch to {selectedChain.name} before minting.</p>
                                        <button
                                            type="button"
                                            onClick={handleSwitchToSelectedChain}
                                            disabled={isSwitchingChain}
                                            className="mt-3 inline-flex items-center justify-center rounded-full border border-amber-300/40 bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-50 transition-colors hover:bg-amber-400/25 disabled:pointer-events-none disabled:opacity-50"
                                        >
                                            {isSwitchingChain ? `Switching to ${selectedChain.name}...` : `Switch to ${selectedChain.name}`}
                                        </button>
                                    </div>
                                )}
                                <button
                                    onClick={handleMint}
                                    disabled={showMiniAppWalletConnecting || shouldPromptForChainSwitch || !isMintEnabledForSelectedChain || isSoldOut || isMinting || hasMinted || isLoading || isPending || isConfirming || isSwitchingChain}
                                    className={`w-full py-4 rounded-full font-bold text-lg transition-all ${hasMinted
                                        ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                        : isSoldOut
                                            ? "bg-red-500/20 text-red-500 border border-red-500/50 cursor-not-allowed"
                                            : (showMiniAppWalletConnecting || shouldPromptForChainSwitch || isMinting || isLoading || isPending || isConfirming || !isMintEnabledForSelectedChain || isSwitchingChain)
                                                ? "bg-white/10 text-white/50 cursor-not-allowed"
                                                : "bg-gradient-to-r from-[#0052FF] to-[#22D3EE] text-white hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(0,82,255,0.35)]"
                                        }`}
                                >
                                    {!isMintEnabledForSelectedChain
                                        ? "Chain Config Missing"
                                        : showMiniAppWalletConnecting
                                            ? "Connecting wallet..."
                                            : shouldPromptForChainSwitch
                                                ? `Switch to ${selectedChain.name} to Mint`
                                                : isLoading
                                                    ? "Loading..."
                                                    : hasMinted
                                                        ? "Minted Successfully"
                                                        : isSoldOut
                                                            ? "Sold Out"
                                                            : (isMinting || isPending || isConfirming)
                                                                ? "Confirming..."
                                                                : "Mint Drop"}
                                </button>
                            </div>
                        )}



                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <a
                                href={creatorShareComposeHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 rounded-full border border-[#8A63D2]/40 bg-[#8A63D2]/20 px-4 py-3 text-sm font-semibold text-[#c5b4ec] transition-colors hover:bg-[#8A63D2]/30"
                            >
                                Share on Farcaster
                            </a>
                            <button
                                onClick={handleShare}
                                className="w-full rounded-full border border-white/[0.06] bg-white/[0.03] py-3 text-sm font-bold text-slate-400 transition-all hover:bg-white/[0.06] hover:text-white"
                            >
                                {copied ? "Link Copied" : "Copy Share Link"}
                            </button>
                        </div>
                    </div>

                    {/* Locked Content Unlock */}
                    {userAddress && (
                        <div className="rounded-2xl border border-[#7C3AED]/15 bg-gradient-to-b from-[#7C3AED]/[0.06] to-transparent p-6 animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="flex items-center justify-between gap-4 mb-3">
                                <div className="flex items-center gap-2">
                                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#7C3AED]" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                                    <h3 className="font-bold text-[#7C3AED] text-sm">Locked Content</h3>
                                </div>
                                <button
                                    onClick={handleUnlockContent}
                                    disabled={!canAttemptUnlock || isUnlocking || isContentUnlocked}
                                    className={`px-4 py-2 rounded-full text-xs font-semibold transition-all border ${(!canAttemptUnlock || isUnlocking || isContentUnlocked)
                                        ? "bg-white/[0.05] text-white/50 border-white/[0.08] cursor-not-allowed"
                                        : "bg-[#7C3AED]/15 text-[#7C3AED] border-[#7C3AED]/30 hover:bg-[#7C3AED]/25"
                                        }`}
                                >
                                    {isContentUnlocked ? "Unlocked" : isUnlocking ? "Unlocking..." : "Unlock Content"}
                                </button>
                            </div>
                            {!canAttemptUnlock && (
                                <p className="text-sm text-slate-500">
                                    Loading drop metadata to enable unlock verification...
                                </p>
                            )}
                            {unlockError && (
                                <p className="text-sm text-red-300 mb-2">
                                    {unlockError}
                                </p>
                            )}
                            {isContentUnlocked && lockedContentData && (
                                <div className="mt-4 pt-4 border-t border-[#7C3AED]/15">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-mono text-[#7C3AED]/70">Secret Data</span>
                                        <button
                                            type="button"
                                            onClick={handleCopyLockedContent}
                                            className="px-1.5 py-0.5 rounded border border-[#7C3AED]/25 text-[#7C3AED] hover:text-white hover:border-[#7C3AED]/40 transition-colors text-xs font-mono"
                                        >
                                            {isLockedContentCopied ? "Copied" : "Copy"}
                                        </button>
                                    </div>
                                    <p className="text-sm font-mono text-[#22D3EE]/80 break-words whitespace-pre-wrap">
                                        {lockedContentData}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Trust Section */}
                    <div className="mt-8 pt-8 border-t border-white/[0.06]">
                        <div className="flex flex-col gap-2 text-xs text-slate-500 font-mono rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <span className="shrink-0">Creator</span>
                                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                    <span className="text-right text-slate-300 break-all">
                                        {isLoading ? "Loading..." : creatorDisplay}
                                    </span>
                                    {creatorIdentity && (
                                        <span className="px-1.5 py-0.5 rounded bg-[#0052FF]/10 text-[#22D3EE] border border-[#0052FF]/20">
                                            {farcasterHandle ? `Wallet-linked: @${farcasterHandle}` : "Wallet-linked profile"}
                                        </span>
                                    )}
                                    {creatorIdentity && (
                                        <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-300 border border-green-500/20">
                                            Linked via signature
                                        </span>
                                    )}
                                    {creatorProfileHref && (
                                        <a
                                            href={creatorProfileHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[#22D3EE] hover:text-[#0052FF] underline decoration-[#0052FF]/30"
                                        >
                                            Profile
                                        </a>
                                    )}
                                    {creatorExplorerHref && (
                                        <a
                                            href={creatorExplorerHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[#22D3EE] hover:text-[#0052FF] underline decoration-[#0052FF]/30"
                                        >
                                            Explorer
                                        </a>
                                    )}
                                    {hasCreatorAddress && (
                                        <button
                                            type="button"
                                            onClick={() => handleCopyTrustValue(creatorAddress, "creator")}
                                            className="px-1.5 py-0.5 rounded border border-white/[0.08] text-slate-300 hover:text-white hover:border-white/20"
                                        >
                                            {copiedTrustKey === "creator" ? "Copied" : "Copy"}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <span className="shrink-0">Identity Source</span>
                                <span className="text-right break-words">
                                    {isLoadingCreatorIdentity
                                        ? "Loading linked identity..."
                                        : creatorIdentityError
                                            ? creatorIdentityError
                                            : creatorIdentity?.fid
                                                ? `Farcaster FID ${creatorIdentity.fid} (wallet-linked)`
                                                : creatorIdentity
                                                    ? "Linked via signature (no Farcaster FID recorded)"
                                                    : isErrorEns
                                                        ? "ENS lookup unavailable"
                                                        : isLoadingEns
                                                            ? "Checking ENS..."
                                                            : ensName
                                                                ? `ENS ${ensName}`
                                                                : "No linked source"}
                                </span>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <span className="shrink-0">Metadata Frozen</span>
                                <div className="flex flex-col items-start sm:items-end text-right">
                                    <span className={`font-semibold ${metadataFrozenLabel === "Yes"
                                        ? "text-green-400"
                                        : metadataFrozenLabel === "Unavailable"
                                            ? "text-red-300"
                                            : "text-gray-300"
                                        }`}>
                                        {metadataFrozenLabel}
                                    </span>
                                    <span className="text-[10px] text-gray-500 max-w-[220px] leading-tight text-right mt-0.5">{metadataFrozenHint}</span>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <span className="shrink-0">Drop Contract</span>
                                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                    <a
                                        href={`${explorerUrl}/address/${contractAddress}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:text-[#0052FF] text-[#22D3EE] underline decoration-[#0052FF]/30"
                                    >
                                        {shortAddress(contractAddress)}
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyTrustValue(contractAddress, "drop-contract")}
                                        className="px-1.5 py-0.5 rounded border border-white/[0.08] text-slate-300 hover:text-white hover:border-white/20"
                                    >
                                        {copiedTrustKey === "drop-contract" ? "Copied" : "Copy"}
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <span className="shrink-0">Droppit Factory</span>
                                {isLoading ? (
                                    <span className="text-gray-600">Loading...</span>
                                ) : factoryAddress ? (
                                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                        <a
                                            href={`${explorerUrl}/address/${factoryAddress}#code`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:text-slate-300 underline decoration-white/20 text-slate-400"
                                        >
                                            {shortAddress(factoryAddress)}
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => handleCopyTrustValue(factoryAddress, "factory")}
                                            className="px-1.5 py-0.5 rounded border border-white/[0.08] text-slate-300 hover:text-white hover:border-white/20"
                                        >
                                            {copiedTrustKey === "factory" ? "Copied" : "Copy"}
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-slate-600">{isError ? "Unavailable" : "Not detected"}</span>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <span className="shrink-0">Implementation</span>
                                {isLoadingFactory ? (
                                    <span className="text-gray-600">Loading...</span>
                                ) : implementationAddress ? (
                                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                        <a
                                            href={`${explorerUrl}/address/${implementationAddress}#code`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:text-slate-300 underline decoration-white/20 text-slate-400"
                                        >
                                            {shortAddress(implementationAddress)}
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => handleCopyTrustValue(implementationAddress, "implementation")}
                                            className="px-1.5 py-0.5 rounded border border-white/[0.08] text-slate-300 hover:text-white hover:border-white/20"
                                        >
                                            {copiedTrustKey === "implementation" ? "Copied" : "Copy"}
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-gray-600">{isErrorFactory ? "Unavailable" : "Not detected"}</span>
                                )}
                            </div>
                        </div>
                        <p className="text-xs text-center text-slate-600 font-mono mt-4">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#0052FF]/20 bg-[#0052FF]/10 text-[#22D3EE] font-semibold mb-2">
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                                Created via Droppit
                            </span>
                            <br />
                            Secured by Base L2. 100% Non-Custodial.
                            <br />
                            <span className="opacity-70 mt-1 inline-block">Names and wallet-linked social profiles are informational signals only and do not constitute Farcaster/Warpcast verification or KYC.</span>
                        </p>
                    </div>
                </div>
            </main >

            {/* Lightbox Overlay */}
            {isLightboxOpen && drop.image && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-xl cursor-zoom-out animate-in fade-in duration-200"
                    onClick={() => setIsLightboxOpen(false)}
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsLightboxOpen(false); }}
                        className="absolute top-6 right-6 flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.05] text-white transition-all hover:bg-white/[0.1] z-[110]"
                        aria-label="Close"
                    >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                    <img
                        src={drop.image}
                        alt={drop.title}
                        className="max-h-[90vh] max-w-[90vw] object-contain rounded-2xl shadow-[0_0_80px_rgba(0,82,255,0.2)] animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div >
    );
}







