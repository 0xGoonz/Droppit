"use client";

import React, { useState } from "react";
import Link from "next/link";
import { formatEther, isAddress } from "viem";
import { useReadContracts, useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useSignMessage, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import {
    ConnectWallet,
    Wallet,
    WalletDropdown,
    WalletDropdownDisconnect,
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
import {
    type ReferralPayload,
    normalizeReferralPayloadFromSearchParams,
    serializeUtm,
} from "@/lib/attribution";

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
    { type: 'function', name: 'factory', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }
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
    const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });
    const { signMessageAsync } = useSignMessage();

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
            const parsed = normalizeReferralPayloadFromSearchParams(new URLSearchParams(window.location.search));
            setReferralPayload(parsed);
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
            }),
        }).catch((error) => {
            console.error("Attribution view event failed:", error);
        });
    }, [contractAddress, isReferralReady, referralPayload, userAddress]);

    const [metadata, setMetadata] = useState<{ name?: string; description?: string; image?: string } | null>(null);

    // Fetch Metadata from IPFS
    React.useEffect(() => {
        if (!tokenUri) return;
        const fetchMetadata = async () => {
            try {
                // Convert ipfs:// to https://
                const url = tokenUri.startsWith("ipfs://")
                    ? tokenUri.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")
                    : tokenUri;

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
        image: metadata?.image ? (metadata.image.startsWith("ipfs://") ? metadata.image.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/") : metadata.image) : null,
    };
    const canAttemptUnlock = !!userAddress && !!tokenUri;
    const receiptHref = receipt?.transactionHash ? `/r/receipt/${receipt.transactionHash}` : null;
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
            }),
        }).catch((error) => {
            console.error("Attribution mint event failed:", error);
        });
    }, [isSuccess, receipt, contractAddress, quantity, userAddress, referralPayload]);

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

        fetchIdentity();
    }, [hasCreatorAddress, creatorAddress]);

    const farcasterHandle = creatorIdentity?.handle || null;
    const creatorDisplay = farcasterHandle
        ? `@${farcasterHandle}`
        : ensName || (hasCreatorAddress ? shortAddress(creatorAddress) : "Unknown");
    const creatorProfileHref = farcasterHandle
        ? `https://warpcast.com/${farcasterHandle}`
        : null;
    const creatorExplorerHref = hasCreatorAddress ? `${explorerUrl}/address/${creatorAddress}` : null;

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
            // Force Network Switch if on the wrong chain
            if (chainId !== selectedChain.id) {
                try {
                    await switchChainAsync({ chainId: selectedChain.id });
                } catch {
                    throw new Error("You must switch to the correct network to mint.");
                }
            }

            setIsMinting(true);

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
            await navigator.clipboard.writeText(window.location.href);
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

    return (
        <div className="min-h-screen bg-[#05070f] text-white selection:bg-[#0052FF]/40 selection:text-white pb-20">
            <nav className="p-6 border-b border-white/10 bg-black/45 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center">
                <BrandLockup markSize={24} wordmarkClassName="text-xl font-bold tracking-tight" />
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex px-3 py-1.5 bg-white/5 rounded-full text-xs font-mono text-gray-400 border border-white/10 items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        {selectedChain.name}
                    </div>
                    <label className="hidden md:flex items-center gap-2 text-xs text-gray-400 font-mono">
                        <span>Chain</span>
                        <select
                            value={selectedChainId}
                            onChange={(event) => setSelectedChainId(Number(event.target.value) as 8453 | 84532)}
                            className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                        >
                            <option value="8453">Base</option>
                            <option value="84532">Base Sepolia</option>
                        </select>
                    </label>
                    <Wallet>
                        <ConnectWallet className="bg-white/10 text-white hover:bg-white/20 px-6 py-2 rounded-full !min-w-[140px] text-sm font-medium transition-all shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                            <Avatar className="h-6 w-6" />
                            <Name />
                        </ConnectWallet>
                        <WalletDropdown className="bg-[#111] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                            <Identity className="px-4 pt-4 pb-2 text-white hover:bg-white/5 transition-colors" hasCopyAddressOnClick>
                                <Avatar className="h-10 w-10 ring-2 ring-blue-500/50" />
                                <Name className="text-white font-bold" />
                                <Address className="text-gray-400 font-mono text-sm" />
                                <EthBalance className="text-blue-400 font-bold" />
                            </Identity>
                            <div className="h-px bg-white/10 w-full" />
                            <WalletDropdownDisconnect className="text-red-400 hover:bg-red-500/10 transition-colors w-full flex items-center justify-center py-3 font-semibold" text="Disconnect" />
                        </WalletDropdown>
                    </Wallet>
                </div>
            </nav>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Left: Artwork */}
                <div className="relative w-full max-w-lg mx-auto lg:mx-0 rounded-3xl overflow-hidden border border-white/10 shadow-[0_0_50px_rgba(59,130,246,0.15)] bg-white/5 group flex flex-col justify-center items-center min-h-[300px]">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10 pointer-events-none" />

                    {drop.image ? (
                        <img src={drop.image} alt={drop.title} className="w-full h-auto object-contain group-hover:scale-105 transition-transform duration-700 block relative z-0" />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-7xl group-hover:scale-110 transition-transform duration-700 z-0">🖼️</div>
                    )}

                    <div className="absolute bottom-6 left-6 z-20">
                        <div className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-1 rounded inline-block mb-2 backdrop-blur-md border border-blue-500/20">
                            ERC-1155
                        </div>
                    </div>
                </div>

                {/* Right: Info & Minting */}
                <div className="flex flex-col justify-center">
                    <div className="mb-8">
                        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-tight">
                            {isLoading ? "Loading Drop..." : drop.title}
                        </h1>
                        <div className="flex items-center gap-3 text-sm text-gray-400 mb-6">
                            <span className="font-mono bg-white/5 px-2 py-1 rounded border border-white/10 text-gray-300">
                                Created by {isLoading ? "Loading..." : creatorDisplay}
                            </span>
                            {isCreatorViewer && (
                                <Link
                                    href={`/drop/base/${contractAddress}/stats`}
                                    className="font-mono bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/30 hover:bg-blue-500/20 transition-colors"
                                >
                                    View Stats
                                </Link>
                            )}
                        </div>
                        <p className="text-gray-400 leading-relaxed text-lg">{drop.description}</p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 mb-8 backdrop-blur-sm">
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Price</p>
                                {Number(priceEth) === 0 ? (
                                    <p className="text-2xl font-bold text-green-400">Free mint</p>
                                ) : (
                                    <p className="text-2xl font-bold text-white">{priceEth} ETH</p>
                                )}
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Minted</p>
                                <p className="text-2xl font-bold text-white">
                                    {minted} <span className="text-gray-600 text-lg">/ {supply}</span>
                                </p>
                            </div>
                        </div>

                        {/* Quantity & Gifting Options */}
                        <div className="space-y-4 mb-6">
                            <div className="flex items-center justify-between bg-white/5 border border-white/10 p-4 rounded-2xl">
                                <span className="text-gray-300 font-medium">Quantity</span>
                                <div className="flex items-center gap-4 bg-black/50 rounded-full px-2 py-1">
                                    <button
                                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={quantity <= 1 || isSoldOut}
                                    >-</button>
                                    <span className="font-mono w-4 text-center">{quantity}</span>
                                    <button
                                        onClick={() => setQuantity(Math.min(maxSelectable, quantity + 1))}
                                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={quantity >= maxSelectable || isSoldOut}
                                    >+</button>
                                </div>
                            </div>

                            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isGifting}
                                        onChange={(e) => {
                                            const nextValue = e.target.checked;
                                            setIsGifting(nextValue);
                                            if (!nextValue) setRecipientError(null);
                                        }}
                                        className="w-5 h-5 rounded border-white/20 bg-black/50 text-blue-500 focus:ring-blue-500 focus:ring-offset-black"
                                    />
                                    <span className="text-gray-300 font-medium">Mint as Gift</span>
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
                                            className={`w-full bg-black/50 border rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-colors ${recipientError
                                                ? "border-red-500/70 focus:border-red-400"
                                                : "border-white/10 focus:border-blue-500"
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
                            <div className="mb-4 p-4 bg-[#111] border border-white/10 rounded-2xl space-y-2">
                                <div className="flex justify-between text-gray-400 text-sm">
                                    <span>Mint price</span>
                                    <span className="font-mono">{Number(priceEth) === 0 ? "Free mint" : `${priceEth} ETH`}</span>
                                </div>
                                <div className="flex justify-between text-gray-400 text-sm">
                                    <span>Protocol fee</span>
                                    <span className="font-mono">{formatEther(rawProtocolFee)} ETH</span>
                                </div>
                                {quantity > 1 && (
                                    <div className="flex justify-between text-white text-sm">
                                        <span>Subtotal (1 qty)</span>
                                        <span className="font-mono">{formatEther(rawPrice + rawProtocolFee)} ETH</span>
                                    </div>
                                )}
                                <div className="h-px bg-white/10 my-2" />
                                <div className="flex justify-between items-center text-white">
                                    <span className="font-bold">Total {quantity > 1 ? `(× ${quantity})` : ""}</span>
                                    <span className="font-mono text-lg font-bold text-blue-400">
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

                        <button
                            onClick={handleMint}
                            disabled={!isMintEnabledForSelectedChain || isSoldOut || isMinting || hasMinted || isLoading || isPending || isConfirming}
                            className={`w-full py-4 rounded-full font-bold text-lg transition-all ${hasMinted
                                ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                : isSoldOut
                                    ? "bg-red-500/20 text-red-500 border border-red-500/50 cursor-not-allowed"
                                    : (isMinting || isLoading || isPending || isConfirming || !isMintEnabledForSelectedChain)
                                        ? "bg-white/10 text-white/50 cursor-not-allowed"
                                        : "bg-white text-black hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                                }`}
                        >
                            {!isMintEnabledForSelectedChain
                                ? "Chain Config Missing"
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

                        {hasMinted && receiptHref && (
                            <Link
                                href={receiptHref}
                                className="w-full mt-3 py-3 rounded-full font-bold text-sm text-blue-300 bg-blue-500/15 hover:bg-blue-500/25 hover:text-white transition-all border border-blue-500/40 flex items-center justify-center"
                            >
                                View Receipt
                            </Link>
                        )}

                        <button
                            onClick={handleShare}
                            className="w-full mt-4 py-3 rounded-full font-bold text-sm text-gray-400 bg-white/5 hover:bg-white/10 hover:text-white transition-all border border-white/5"
                        >
                            {copied ? "Link Copied! ✓" : "Share Link 🔗"}
                        </button>
                    </div>

                    {/* Locked Content Unlock */}
                    {userAddress && (
                        <div className="p-6 rounded-2xl bg-indigo-900/20 border border-indigo-500/30 animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="flex items-center justify-between gap-4 mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-indigo-400">🔓</span>
                                    <h3 className="font-bold text-indigo-300">Locked Content</h3>
                                </div>
                                <button
                                    onClick={handleUnlockContent}
                                    disabled={!canAttemptUnlock || isUnlocking || isContentUnlocked}
                                    className={`px-4 py-2 rounded-full text-xs font-semibold transition-all border ${(!canAttemptUnlock || isUnlocking || isContentUnlocked)
                                        ? "bg-white/10 text-white/50 border-white/10 cursor-not-allowed"
                                        : "bg-indigo-500/20 text-indigo-200 border-indigo-400/40 hover:bg-indigo-500/30"
                                        }`}
                                >
                                    {isContentUnlocked ? "Unlocked" : isUnlocking ? "Unlocking..." : "Unlock Content"}
                                </button>
                            </div>
                            {!canAttemptUnlock && (
                                <p className="text-sm text-indigo-200/70">
                                    Loading drop metadata to enable unlock verification...
                                </p>
                            )}
                            {unlockError && (
                                <p className="text-sm text-red-300 mb-2">
                                    {unlockError}
                                </p>
                            )}
                            {isContentUnlocked && lockedContentData && (
                                <div className="mt-4 pt-4 border-t border-indigo-500/20">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-mono text-indigo-300/70">Secret Data</span>
                                        <button
                                            type="button"
                                            onClick={handleCopyLockedContent}
                                            className="px-1.5 py-0.5 rounded border border-indigo-500/30 text-indigo-300 hover:text-white hover:border-indigo-400/50 transition-colors text-xs font-mono"
                                        >
                                            {isLockedContentCopied ? "Copied" : "Copy"}
                                        </button>
                                    </div>
                                    <p className="text-sm font-mono text-indigo-200/80 break-words whitespace-pre-wrap">
                                        {lockedContentData}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Trust Section */}
                    <div className="mt-8 pt-8 border-t border-white/10">
                        <div className="flex flex-col gap-2 text-xs text-gray-500 font-mono bg-black/30 p-4 rounded-xl border border-white/5">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <span className="shrink-0">Creator</span>
                                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                    <span className="text-right text-gray-300 break-all">
                                        {isLoading ? "Loading..." : creatorDisplay}
                                    </span>
                                    {creatorIdentity && (
                                        <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
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
                                            className="text-blue-400 hover:text-blue-300 underline decoration-blue-500/30"
                                        >
                                            Profile
                                        </a>
                                    )}
                                    {creatorExplorerHref && (
                                        <a
                                            href={creatorExplorerHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300 underline decoration-blue-500/30"
                                        >
                                            Explorer
                                        </a>
                                    )}
                                    {hasCreatorAddress && (
                                        <button
                                            type="button"
                                            onClick={() => handleCopyTrustValue(creatorAddress, "creator")}
                                            className="px-1.5 py-0.5 rounded border border-white/15 text-gray-300 hover:text-white hover:border-white/25"
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
                                        className="hover:text-blue-400 text-blue-500 underline decoration-blue-500/30"
                                    >
                                        {shortAddress(contractAddress)}
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyTrustValue(contractAddress, "drop-contract")}
                                        className="px-1.5 py-0.5 rounded border border-white/15 text-gray-300 hover:text-white hover:border-white/25"
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
                                            className="hover:text-gray-300 underline decoration-white/20 text-gray-400"
                                        >
                                            {shortAddress(factoryAddress)}
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => handleCopyTrustValue(factoryAddress, "factory")}
                                            className="px-1.5 py-0.5 rounded border border-white/15 text-gray-300 hover:text-white hover:border-white/25"
                                        >
                                            {copiedTrustKey === "factory" ? "Copied" : "Copy"}
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-gray-600">{isError ? "Unavailable" : "Not detected"}</span>
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
                                            className="hover:text-gray-300 underline decoration-white/20 text-gray-400"
                                        >
                                            {shortAddress(implementationAddress)}
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => handleCopyTrustValue(implementationAddress, "implementation")}
                                            className="px-1.5 py-0.5 rounded border border-white/15 text-gray-300 hover:text-white hover:border-white/25"
                                        >
                                            {copiedTrustKey === "implementation" ? "Copied" : "Copy"}
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-gray-600">{isErrorFactory ? "Unavailable" : "Not detected"}</span>
                                )}
                            </div>
                        </div>
                        <p className="text-xs text-center text-gray-600 font-mono mt-4">
                            Secured by Base L2. 100% Non-Custodial.
                            <br />
                            <span className="opacity-70 mt-1 inline-block">Names and wallet-linked social profiles are informational signals only and do not constitute Farcaster/Warpcast verification or KYC.</span>
                        </p>
                    </div>
                </div>
            </main >
        </div >
    );
}

