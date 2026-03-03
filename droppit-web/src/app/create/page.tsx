"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatEther, parseEther, keccak256, encodePacked, isAddress } from "viem";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_LABEL, ALLOWED_MIME_ACCEPT } from "@/lib/constants/upload";
import { validateLockedContent } from "@/lib/validation/drops";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useSignMessage } from "wagmi";
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
import { FACTORY_ABI } from "@/lib/contracts";
import { useChainPreference } from "@/providers/OnchainKitProvider";
import { BrandLockup } from "@/components/brand/BrandLockup";

export default function CreateDrop() {
    const [step, setStep] = useState(1);
    const [draftId, setDraftId] = useState<string | null>(null);
    const [autoDeploy, setAutoDeploy] = useState(false);
    const [hasHydrated, setHasHydrated] = useState(false);
    const [hydrationError, setHydrationError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        editionSize: "100",
        mintPrice: "0",
        lockedContent: "",
        farcasterHandle: "",
        payoutRecipient: "",
    });
    const [isLinkingIdentity, setIsLinkingIdentity] = useState(false);
    const [identityVerified, setIdentityVerified] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [deployedState, setDeployedState] = useState<{ tokenUri: string, imageUri: string, draftId: string, salt: string, commitment: string } | null>(null);

    // Pre-existing IPFS URIs hydrated from draft (skip re-upload when available)
    const [draftImageUrl, setDraftImageUrl] = useState<string | null>(null);
    const [draftTokenUri, setDraftTokenUri] = useState<string | null>(null);

    // One-shot deploy guard: prevents accidental repeated deploy triggers
    const deployFiredRef = useRef(false);
    const {
        selectedChain,
        selectedChainId,
        setSelectedChainId,
        hasSelectedChainContractConfig,
        chainContracts,
    } = useChainPreference();
    const selectedFactoryAddress = chainContracts?.factoryAddress || "";

    const { address, chainId } = useAccount();
    const router = useRouter();
    const { data: hash, writeContractAsync, isPending } = useWriteContract();
    const { switchChainAsync } = useSwitchChain();
    const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    // Parse draftId and auto from URL on mount, then hydrate formData from API
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (hasHydrated) return;

        const searchParams = new URLSearchParams(window.location.search);
        const dId = searchParams.get('draftId');
        const auto = searchParams.get('auto');

        if (!dId) {
            setHasHydrated(true);
            return;
        }

        setDraftId(dId);
        if (auto === '1') setAutoDeploy(true);

        fetch(`/api/drops/${dId}`)
            .then(async (res) => {
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || `Draft fetch failed (${res.status})`);
                }
                return res.json();
            })
            .then(data => {
                if (data && !data.error) {
                    setFormData(prev => ({
                        ...prev,
                        title: data.title || prev.title,
                        description: data.description || prev.description,
                        editionSize: data.editionSize || prev.editionSize,
                        mintPrice: data.mintPriceWei ? formatEther(BigInt(data.mintPriceWei)) : prev.mintPrice,
                        payoutRecipient: data.payoutRecipient || prev.payoutRecipient,
                        lockedContent: data.lockedContent || prev.lockedContent,
                    }));
                    // Hydrate pre-existing IPFS URIs from draft
                    if (data.imageUrl) setDraftImageUrl(data.imageUrl);
                    if (data.tokenUri) setDraftTokenUri(data.tokenUri);
                    setHydrationError(null);
                } else if (data?.error) {
                    setHydrationError(data.error);
                    setAutoDeploy(false);
                }
                setHasHydrated(true);
            })
            .catch(err => {
                console.error("[CreateDrop] Hydration failed:", err);
                setHydrationError(err.message || "Failed to load draft data.");
                setAutoDeploy(false);
                setHasHydrated(true);
            });
    }, [hasHydrated]);

    useEffect(() => {
        if (isSuccess && receipt && deployedState && selectedFactoryAddress) {
            const dropCreatedLog = receipt.logs.find(log => log.address.toLowerCase() === selectedFactoryAddress.toLowerCase());

            if (dropCreatedLog && dropCreatedLog.topics[2]) {
                const rawAddress = dropCreatedLog.topics[2];
                // Extract the last 40 characters (20 bytes) to get the clean address
                const dropAddress = "0x" + rawAddress.slice(-40);

                // Finalize to LIVE via draft ID mapping securely
                fetch(`/api/drops/${deployedState.draftId}/publish`, {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        txHash: receipt.transactionHash,
                        contractAddress: dropAddress,
                        tokenUri: deployedState.tokenUri,
                        imageUrl: deployedState.imageUri,
                        lockedContent: formData.lockedContent,
                        salt: deployedState.salt,
                        commitment: deployedState.commitment
                    })
                }).then(() => {
                    router.push(`/drop/base/${dropAddress}/stats`);
                }).catch(err => {
                    console.error("Publish failed:", err);
                    router.push(`/drop/base/${dropAddress}/stats`);
                });
            }
        }
    }, [isSuccess, receipt, router, deployedState, formData.lockedContent, selectedFactoryAddress]);

    const handleNext = () => setStep((s) => Math.min(s + 1, 4));
    const handlePrev = () => setStep((s) => Math.max(s - 1, 1));

    const { signMessageAsync } = useSignMessage();

    const handleLinkIdentity = async () => {
        if (!address) return;
        if (!formData.farcasterHandle) {
            setFormError("Please enter a handle to link");
            return;
        }

        // Basic frontend format catch
        if (!/^[a-zA-Z0-9_.-]+$/.test(formData.farcasterHandle)) {
            setFormError("Handles can only contain letters, numbers, underscores, dashes or dots.");
            return;
        }

        setIsLinkingIdentity(true);
        setFormError(null);

        try {
            // 1. Get Nonce
            const nonceRes = await fetch('/api/identity/link/nonce', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet: address, handle: formData.farcasterHandle })
            });
            const { nonce, error: nonceErr } = await nonceRes.json();
            if (nonceErr || !nonce) throw new Error(nonceErr || "Failed to generate challenge");

            // 2. Sign
            const signature = await signMessageAsync({ message: nonce });

            // 3. Verify and Persist API
            const verifyRes = await fetch('/api/identity/link/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: address,
                    handle: formData.farcasterHandle,
                    signature,
                    nonce
                })
            });

            const { error: verifyErr } = await verifyRes.json();
            if (!verifyRes.ok || verifyErr) throw new Error(verifyErr || "Signature verification failed");

            setIdentityVerified(true);
            setTimeout(() => {
                handleNext();
            }, 1000);

        } catch (e: unknown) {
            console.error("Identity Link Failed:", e);
            const message = e instanceof Error ? e.message : "Failed to successfully verify identity.";
            setFormError(message);
        } finally {
            setIsLinkingIdentity(false);
        }
    };

    const handleDeploy = useCallback(async () => {
        // One-shot guard: prevent multiple deploy triggers
        if (deployFiredRef.current) return;
        if (!hasHydrated) return;
        if (!address) return;
        if (!hasSelectedChainContractConfig || !selectedFactoryAddress) {
            setFormError(`Deployment is unavailable: ${selectedChain.name} contract config is missing.`);
            return;
        }
        // Art is required unless the draft already has IPFS URIs from a prior upload
        if (!file && !draftTokenUri) {
            setFormError("Missing artwork file");
            return;
        }

        // Mark as fired immediately to block re-entry
        deployFiredRef.current = true;

        setFormError(null);

        // 0. Resolve Payout Recipient
        let finalPayoutRecipient: `0x${string}` = address;
        if (formData.payoutRecipient.trim()) {
            if (!isAddress(formData.payoutRecipient.trim())) {
                setFormError("Invalid Payout Recipient address.");
                return;
            }
            finalPayoutRecipient = formData.payoutRecipient.trim() as `0x${string}`;
        }

        try {
            // 1. Force Network Switch if on the wrong chain
            if (chainId !== selectedChain.id) {
                try {
                    await switchChainAsync({ chainId: selectedChain.id });
                } catch {
                    throw new Error("You must switch to the correct network to deploy.");
                }
            }

            setIsUploading(true);

            // 2. Resolve Draft ID (Create if not resumed from webhook frame)
            let currentDraftId = draftId;

            if (!currentDraftId) {
                const draftRes = await fetch("/api/drops", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: formData.title,
                        description: formData.description,
                        editionSize: formData.editionSize,
                        mintPriceWei: parseEther(formData.mintPrice || "0").toString(),
                        creatorAddress: address,
                        payoutRecipient: finalPayoutRecipient
                    })
                });
                const draftData = await draftRes.json();
                if (!draftRes.ok) throw new Error(draftData.error || "Failed to create draft");
                currentDraftId = draftData.dropId;
            }

            // 3. Resolve IPFS URIs — reuse draft values or upload fresh
            let tokenUri: string;
            let imageUri: string;

            if (!file && draftTokenUri && draftImageUrl) {
                // Draft already has IPFS URIs from a prior upload; skip re-upload
                tokenUri = draftTokenUri;
                imageUri = draftImageUrl;
            } else if (file) {
                const uploadData = new FormData();
                uploadData.append("file", file);
                uploadData.append("title", formData.title);
                uploadData.append("description", formData.description);

                const res = await fetch("/api/upload", {
                    method: "POST",
                    body: uploadData,
                });
                const uploadResult = await res.json();

                if (!res.ok || uploadResult.error) throw new Error(uploadResult.error || "IPFS Upload failed");
                tokenUri = uploadResult.tokenUri;
                imageUri = uploadResult.imageUri;
            } else {
                throw new Error("No artwork file or existing IPFS URIs available.");
            }

            // 4. Generate Salt and Commitment for Locked Content
            let saltHex = "0x" + "00".repeat(32); // Default to empty 32-byte hash
            let commitment = "0x" + "00".repeat(32);

            if (formData.lockedContent) {
                // Generate a random 32-byte salt
                const randomBytes = new Uint8Array(32);
                window.crypto.getRandomValues(randomBytes);
                saltHex = "0x" + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

                // Derive commitment: keccak256(encodePacked(['bytes32', 'string'], [salt, lockedContent]))
                commitment = keccak256(
                    encodePacked(
                        ['bytes32', 'string'],
                        [saltHex as `0x${string}`, formData.lockedContent]
                    )
                );
            }

            // Store URIs + Draft ID + Salt into state hook so the effect can transition it to LIVE
            setDeployedState({ tokenUri, imageUri, draftId: currentDraftId as string, salt: saltHex, commitment });

            // 5. Sign Transaction on Base
            await writeContractAsync({
                chainId: selectedChain.id,
                address: selectedFactoryAddress as `0x${string}`,
                abi: FACTORY_ABI,
                functionName: "createDrop",
                args: [
                    BigInt(formData.editionSize || "1"),
                    parseEther(formData.mintPrice || "0"),
                    finalPayoutRecipient as `0x${string}`, // payoutRecipient
                    tokenUri,
                    commitment as `0x${string}`
                ]
            });
        } catch (e: unknown) {
            console.error("Deploy error:", e);
            const message = e instanceof Error ? e.message : "Deployment failed";
            setFormError(message);
            // Reset the one-shot guard so user can retry after fixing the issue
            deployFiredRef.current = false;
        } finally {
            setIsUploading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address, hasSelectedChainContractConfig, selectedFactoryAddress, selectedChain, file, chainId, formData, draftId, hasHydrated, draftTokenUri, draftImageUrl]);

    // Auto-deploy: trigger deploy only after all prerequisites are met
    useEffect(() => {
        if (!autoDeploy || !hasHydrated || hydrationError) return;
        if (deployFiredRef.current || isUploading || isPending || isConfirming || isSuccess) return;
        if (!hasSelectedChainContractConfig || !selectedFactoryAddress) return;

        const hasArt = !!(file || draftTokenUri);
        if (address && hasArt && chainId === selectedChain.id && !formError) {
            setAutoDeploy(false);
            handleDeploy();
        }
    }, [autoDeploy, hasHydrated, hydrationError, address, file, chainId, formError, isUploading, isPending, isConfirming, isSuccess, handleDeploy, draftTokenUri, hasSelectedChainContractConfig, selectedFactoryAddress, selectedChain]);

    return (
        <div className="min-h-screen bg-[#05070f] text-white selection:bg-[#0052FF]/40 selection:text-white pb-20">
            {/* Simple Nav with Wallet */}
            <nav className="p-6 flex justify-between items-center max-w-5xl mx-auto">
                <BrandLockup markSize={24} wordmarkClassName="text-xl font-bold tracking-tight" />

                <div className="flex items-center gap-3">
                    <label className="hidden sm:flex items-center gap-2 text-xs text-gray-400 font-mono">
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
                        <ConnectWallet className="bg-white/10 text-white hover:bg-white/20 px-6 py-2 rounded-full !min-w-[160px] font-medium transition-all">
                            <Avatar className="h-6 w-6" />
                            <Name />
                        </ConnectWallet>
                        <WalletDropdown className="bg-[#111] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                            <Identity className="px-4 pt-4 pb-2 text-white hover:bg-white/5 transition-colors" hasCopyAddressOnClick>
                                <Avatar className="h-10 w-10 ring-2 ring-purple-500/50" />
                                <Name className="text-white font-bold" />
                                <Address className="text-gray-400 font-mono text-sm" />
                                <EthBalance className="text-purple-400 font-bold" />
                            </Identity>
                            <div className="h-px bg-white/10 w-full" />
                            <WalletDropdownDisconnect className="text-red-400 hover:bg-red-500/10 transition-colors w-full flex items-center justify-center py-3 font-semibold" text="Disconnect" />
                        </WalletDropdown>
                    </Wallet>
                </div>
            </nav>

            <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-12">
                {/* Hydration loading / error indicators */}
                {draftId && !hasHydrated && (
                    <div className="mb-8 p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-xl animate-in fade-in slide-in-from-top-2">
                        <h3 className="text-yellow-400 font-bold mb-2">⏳ Loading Draft…</h3>
                        <p className="text-yellow-200 text-sm">Fetching your draft data, please wait.</p>
                    </div>
                )}
                {hydrationError && (
                    <div className="mb-8 p-4 bg-red-500/10 border border-red-500/50 rounded-xl animate-in fade-in slide-in-from-top-2">
                        <h3 className="text-red-400 font-bold mb-2">❌ Draft Load Failed</h3>
                        <p className="text-red-200 text-sm">{hydrationError}</p>
                    </div>
                )}
                {autoDeploy && !hydrationError && (
                    <div className="mb-8 p-4 bg-blue-500/10 border border-blue-500/50 rounded-xl animate-in fade-in slide-in-from-top-2">
                        <h3 className="text-blue-400 font-bold mb-2">⚡ Auto-Deploy Pending</h3>
                        <p className="text-blue-200 text-sm mb-2">Please complete the following to automatically finish your drop:</p>
                        <ul className="list-disc list-inside text-sm text-blue-300">
                            {!hasHydrated && <li>Loading draft data…</li>}
                            {!address && <li>Connect your wallet</li>}
                            {address && chainId !== selectedChain.id && <li>Switch to {selectedChain.name} in your wallet</li>}
                            {!hasSelectedChainContractConfig && <li>{selectedChain.name} deployment config is missing.</li>}
                            {!file && !draftTokenUri && <li>Upload artwork media</li>}
                        </ul>
                    </div>
                )}
                {!address ? (
                    <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center mb-2">
                            <span className="text-3xl">🔌</span>
                        </div>
                        <h1 className="text-4xl font-extrabold tracking-tight">Connect your Wallet</h1>
                        <p className="text-gray-400 max-w-md mx-auto">Connect your wallet to configure and deploy an ERC-1155 Drop on {selectedChain.name}.</p>
                        <Wallet>
                            <ConnectWallet className="bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(219,39,119,0.4)] px-8 py-3 rounded-full !min-w-[200px]">
                                <Avatar className="h-6 w-6" />
                                <Name />
                            </ConnectWallet>
                        </Wallet>
                    </div>
                ) : (
                    <>
                        <div className="mb-12">
                            <h1 className="text-4xl font-extrabold tracking-tight mb-4">Launch your Drop</h1>
                            <p className="text-gray-400">Configure your {selectedChain.name} ERC-1155 contract and unlockable content.</p>
                        </div>

                        {/* Stepper */}
                        <div className="flex items-center gap-4 mb-12">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="flex items-center gap-4 flex-1">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${step >= i ? "bg-purple-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.4)]" : "bg-white/5 text-gray-500"
                                            }`}
                                    >
                                        {i}
                                    </div>
                                    {i !== 4 && <div className={`h-[2px] w-full ${step > i ? "bg-purple-600/50" : "bg-white/5"}`} />}
                                </div>
                            ))}
                        </div>

                        {/* Form Container */}
                        <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
                            {/* Error Message Display */}
                            {formError && (
                                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl animate-in fade-in slide-in-from-top-2">
                                    <p className="text-red-400 font-semibold text-center text-sm">
                                        ⚠️ {formError}
                                    </p>
                                </div>
                            )}

                            {step === 1 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Drop Title</label>
                                        <input
                                            type="text"
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                            placeholder="e.g. The Farcaster Genesis"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                                        <textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors h-32 resize-none"
                                            placeholder="Tell the story behind this drop..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Artwork Image (PNG, JPG, WebP)</label>
                                        <div className="border-2 border-dashed border-white/20 rounded-2xl p-8 text-center hover:bg-white/[0.02] transition-colors cursor-pointer">
                                            <input
                                                type="file"
                                                accept={ALLOWED_MIME_ACCEPT}
                                                className="hidden"
                                                id="file-upload"
                                                onChange={(e) => {
                                                    const selectedFile = e.target.files?.[0] || null;
                                                    if (selectedFile && selectedFile.size > MAX_UPLOAD_SIZE_BYTES) {
                                                        setFormError(`Artwork media exceeds the ${MAX_UPLOAD_SIZE_LABEL} size limit.`);
                                                        return;
                                                    }
                                                    setFormError(null);
                                                    setFile(selectedFile);
                                                }}
                                            />
                                            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center w-full">
                                                {file ? (
                                                    <div className="relative flex justify-center w-full mb-4">
                                                        <img
                                                            src={URL.createObjectURL(file)}
                                                            alt="Preview"
                                                            className="max-h-[250px] max-w-full object-contain rounded-xl border border-white/10 shadow-[0_0_20px_rgba(147,51,234,0.2)]"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="text-4xl mb-4">🖼️</div>
                                                )}
                                                <span className="text-gray-400 font-medium">
                                                    {file ? file.name : `Click to upload media (max ${MAX_UPLOAD_SIZE_LABEL})`}
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step === 2 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Edition Size (Max Supply)</label>
                                            <input
                                                type="number"
                                                min="1" max="10000"
                                                value={formData.editionSize}
                                                onChange={(e) => setFormData({ ...formData, editionSize: e.target.value })}
                                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                            />
                                            <p className="text-xs text-gray-500 mt-2">Between 1 and 10,000</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Mint Price (ETH)</label>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                min="0"
                                                value={formData.mintPrice}
                                                onChange={(e) => setFormData({ ...formData, mintPrice: e.target.value })}
                                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                            />
                                            <p className="text-xs text-gray-500 mt-2">Set to 0 for Free Mints</p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Wallet to receive funds (defaults to you)</label>
                                        <input
                                            type="text"
                                            value={formData.payoutRecipient}
                                            onChange={(e) => setFormData({ ...formData, payoutRecipient: e.target.value })}
                                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors font-mono disabled:opacity-50"
                                            placeholder={address ? address : "0x..."}
                                        />
                                        <p className="text-xs text-gray-500 mt-2">Optional: specify a different wallet address to receive mint proceeds.</p>
                                    </div>

                                    <div className="p-4 rounded-xl bg-purple-900/10 border border-purple-500/20">
                                        <h4 className="font-semibold text-purple-300 mb-1">Locked Content (Supabase Vault)</h4>
                                        <p className="text-sm text-purple-200/60 mb-4">This special message, link, or password will only be visible to wallets that own the NFT.</p>
                                        <textarea
                                            value={formData.lockedContent}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const check = validateLockedContent(val);
                                                if (!check.valid) {
                                                    setFormError(check.error);
                                                } else {
                                                    setFormError(null);
                                                }
                                                setFormData({ ...formData, lockedContent: val });
                                            }}
                                            maxLength={1000}
                                            className="w-full bg-black/80 border border-purple-500/30 rounded-xl px-4 py-3 text-green-400 font-mono text-sm focus:outline-none focus:border-purple-500 transition-colors h-32 resize-none"
                                            placeholder="e.g. The secret password for the event is 'BASE'"
                                        />
                                    </div>
                                </div>
                            )}

                            {step === 3 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="text-center mb-8">
                                        <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                                            <span className="text-3xl text-blue-400">👤</span>
                                        </div>
                                        <h3 className="text-xl font-bold mb-2">Creator Identity (Optional)</h3>
                                        <p className="text-gray-400 text-sm">Sign a message with your wallet to explicitly link your Droppit account to an external handle for a wallet-linked identity signal on the drop page.</p>
                                    </div>

                                    <div className="p-6 bg-blue-900/10 border border-blue-500/20 rounded-2xl space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-blue-300 mb-2">Handle / Username</label>
                                            <div className="relative">
                                                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-blue-400/50 font-mono">@</span>
                                                <input
                                                    type="text"
                                                    value={formData.farcasterHandle}
                                                    onChange={(e) => setFormData({ ...formData, farcasterHandle: e.target.value.replace(/[^a-zA-Z0-9_.-]/g, '') })}
                                                    className="w-full bg-black/60 border border-blue-500/30 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors font-mono disabled:opacity-50"
                                                    placeholder="e.g. jesse.base"
                                                    disabled={identityVerified}
                                                />
                                            </div>
                                        </div>

                                        <div className="pt-2">
                                            {identityVerified ? (
                                                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3 text-green-400">
                                                    <span>✅</span>
                                                    <span className="font-semibold text-sm">Linked to @{formData.farcasterHandle}</span>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={handleLinkIdentity}
                                                    disabled={!formData.farcasterHandle || isLinkingIdentity}
                                                    className="w-full py-3 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold hover:bg-blue-600/30 hover:border-blue-500/50 transition-all disabled:opacity-30 disabled:pointer-events-none"
                                                >
                                                    {isLinkingIdentity ? "Signing..." : "Link handle via signature"}
                                                </button>
                                            )}
                                        </div>

                                        <p className="text-xs text-blue-200/50 text-center leading-relaxed mt-4">
                                            * This applies an active wallet signature check confirming ownership of the handle text for anti-spoofing indicators rendering across client viewers. Not a KYC platform. Skip if you prefer full anonymity.
                                        </p>
                                    </div>

                                    {!identityVerified && (
                                        <div className="text-center mt-4">
                                            <button onClick={handleNext} className="text-sm text-gray-500 hover:text-white underline decoration-white/20">Skip and Continue Anonymously</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {step === 4 && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="text-center">
                                        <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                            <span className="text-4xl">🚀</span>
                                        </div>
                                        <h2 className="text-2xl font-bold mb-2">Ready to Deploy</h2>
                                        <p className="text-gray-400">Review your drop details before signing the {selectedChain.name} transaction.</p>
                                    </div>

                                    {!hasSelectedChainContractConfig && (
                                        <div className="p-4 bg-yellow-500/10 border border-yellow-500/40 rounded-xl text-yellow-200 text-sm">
                                            Deployment is disabled: missing factory/implementation configuration for {selectedChain.name}.
                                        </div>
                                    )}

                                    <div className="bg-black/50 rounded-2xl p-6 border border-white/5 space-y-4 font-mono text-sm">
                                        <div className="flex justify-between border-b border-white/10 pb-4">
                                            <span className="text-gray-500">Title</span>
                                            <span className="text-white">{formData.title || "Untitled"}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/10 pb-4">
                                            <span className="text-gray-500">Supply</span>
                                            <span className="text-white">{formData.editionSize}</span>
                                        </div>
                                        <div className="flex justify-between pb-4 border-b border-white/10">
                                            <span className="text-gray-500">Price</span>
                                            <span className={Number(formData.mintPrice) === 0 ? "text-green-400 font-bold" : "text-white"}>{Number(formData.mintPrice) === 0 ? "Free mint" : `${formData.mintPrice} ETH`}</span>
                                        </div>
                                        <div className="flex justify-between pb-2">
                                            <span className="text-gray-500">Recipient</span>
                                            <span className="text-white truncate max-w-[150px] sm:max-w-xs">{formData.payoutRecipient.trim() ? formData.payoutRecipient.trim() : address}</span>
                                        </div>
                                    </div>
                                </div>
                            )}



                            {/* Action Buttons */}
                            <div className="mt-12 flex justify-between items-center pt-6 border-t border-white/10">
                                <button
                                    onClick={handlePrev}
                                    disabled={step === 1}
                                    className={`px-6 py-2 rounded-full font-medium transition-colors ${step === 1 ? "opacity-0 pointer-events-none" : "text-gray-400 hover:text-white bg-white/5 hover:bg-white/10"
                                        }`}
                                >
                                    Back
                                </button>

                                {step < 4 ? (
                                    <button
                                        onClick={() => {
                                            if (step === 1 && (!formData.title.trim() || !file)) {
                                                setFormError("Please provide a Drop Title and upload an Artwork Media to proceed.");
                                                return;
                                            }

                                            if (step === 2) {
                                                if (formData.lockedContent) {
                                                    const check = validateLockedContent(formData.lockedContent);
                                                    if (!check.valid) {
                                                        setFormError(check.error);
                                                        return;
                                                    }
                                                }

                                                if (formData.payoutRecipient.trim()) {
                                                    // Import isAddress here if not at top, but viem is imported at top
                                                    import('viem').then(({ isAddress }) => {
                                                        if (!isAddress(formData.payoutRecipient.trim())) {
                                                            setFormError("Payout Recipient is not a valid EVM address.");
                                                            return;
                                                        } else {
                                                            setFormError(null);
                                                            handleNext();
                                                        }
                                                    });
                                                    return; // Async import handling, return early to prevent sync handleNext
                                                }
                                            }

                                            // Step 3 handles identity internally vs skip explicit handler.
                                            if (step === 3 && formData.farcasterHandle && !identityVerified) {
                                                setFormError("Please link your entered handle via signature, or clear the box completely to skip anonymously.");
                                                return;
                                            }

                                            setFormError(null);
                                            handleNext();
                                        }}
                                        className="px-8 py-2 rounded-full bg-white text-black font-bold hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                                    >
                                        Next Step
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            if (!address) {
                                                alert("Please connect your wallet first using the button at the top right.");
                                                return;
                                            }
                                            handleDeploy();
                                        }}
                                        disabled={!hasSelectedChainContractConfig || !hasHydrated || !!hydrationError || isUploading || isPending || isConfirming || isSuccess}
                                        className="px-8 py-2 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(219,39,119,0.5)] disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                        {!address
                                            ? "Connect to Deploy"
                                            : !hasSelectedChainContractConfig
                                                ? "Chain Config Missing"
                                                : !hasHydrated
                                                    ? "Loading draft…"
                                                    : isUploading
                                                        ? "Uploading to IPFS..."
                                                        : (isPending || isConfirming)
                                                            ? "Confirming tx..."
                                                            : isSuccess
                                                                ? "Redirecting to Drop..."
                                                                : "Sign & Deploy"}
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
