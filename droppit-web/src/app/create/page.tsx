"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatEther, parseEther, keccak256, encodePacked, isAddress } from "viem";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_LABEL, ALLOWED_MIME_ACCEPT } from "@/lib/constants/upload";
import { validateLockedContent } from "@/lib/validation/drops";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useSignMessage, usePublicClient } from "wagmi";
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

    const [deployGasEstimate, setDeployGasEstimate] = useState<string | null>(null);

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
    const publicClient = usePublicClient({ chainId: selectedChainId });

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

        fetch(`/api/drops/${dId}`, {
            headers: address ? { "x-creator-address": address } : {},
        })
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
                    router.push(`/drop/base/${dropAddress}`);
                }).catch(err => {
                    console.error("Publish failed:", err);
                    router.push(`/drop/base/${dropAddress}`);
                });
            }
        }
    }, [isSuccess, receipt, router, deployedState, formData.lockedContent, selectedFactoryAddress]);

    // Estimate deployment gas when entering Step 4
    useEffect(() => {
        if (step !== 4 || !publicClient || !address || !hasSelectedChainContractConfig || !selectedFactoryAddress) return;

        let isMounted = true;
        async function estimate() {
            try {
                const dummyTokenUri = draftTokenUri || "ipfs://QmDummyHash12345678901234567890123456789012345678901234567";
                const dummyCommitment = "0x" + "00".repeat(32);
                let finalPayoutRecipient: `0x${string}` = address as `0x${string}`;

                if (formData.payoutRecipient.trim() && isAddress(formData.payoutRecipient.trim())) {
                    finalPayoutRecipient = formData.payoutRecipient.trim() as `0x${string}`;
                }

                let gas: bigint;
                try {
                    gas = await publicClient!.estimateContractGas({
                        address: selectedFactoryAddress as `0x${string}`,
                        abi: FACTORY_ABI,
                        functionName: "createDrop",
                        account: address as `0x${string}`,
                        args: [
                            BigInt(formData.editionSize || "1"),
                            parseEther(formData.mintPrice || "0"),
                            finalPayoutRecipient,
                            dummyTokenUri,
                            dummyCommitment as `0x${string}`
                        ]
                    });
                } catch (err) {
                    console.warn("Real gas estimation failed, using safe fallback for EIP-1167 proxy:", err);
                    gas = BigInt(350000); // Safe fallback estimate for clone deploy + init
                }

                const gasPrice = await publicClient!.getGasPrice();
                const costWei = gas * gasPrice;
                if (isMounted) {
                    // Small buffer added (+10%) for safety margin in UX
                    setDeployGasEstimate(formatEther(costWei + (costWei / BigInt(10))));
                }
            } catch (err) {
                console.warn("Gas calculation entirely failed:", err);
                if (isMounted) setDeployGasEstimate("Unknown");
            }
        }
        estimate();
        return () => { isMounted = false; };
    }, [step, publicClient, address, formData, draftTokenUri, hasSelectedChainContractConfig, selectedFactoryAddress]);

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

                if (!res.ok) {
                    let errMsg = "IPFS Upload failed";
                    if (res.status === 413) {
                        errMsg = "Artwork file is too large (maximum allowed size: 20MB).";
                    } else {
                        try {
                            const errData = await res.json();
                            errMsg = errData.error || errMsg;
                        } catch {
                            errMsg = `Upload failed with status ${res.status}`;
                        }
                    }
                    throw new Error(errMsg);
                }

                const uploadResult = await res.json();
                if (uploadResult.error) throw new Error(uploadResult.error);

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
        <div className="relative min-h-screen bg-[#05070f] text-white selection:bg-[#0052FF]/40 selection:text-white pb-20 overflow-hidden">
            {/* Background gradient — matches all pages */}
            <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_20%_0%,rgba(0,82,255,0.16),transparent_34%),radial-gradient(circle_at_80%_0%,rgba(34,211,238,0.14),transparent_32%),radial-gradient(circle_at_65%_85%,rgba(124,58,237,0.12),transparent_36%)]" />

            {/* Nav */}
            <nav className="relative z-20 flex items-center justify-between px-4 py-5 sm:px-6 lg:px-8 max-w-6xl mx-auto">
                <BrandLockup markSize={28} wordmarkClassName="text-xl font-bold tracking-tight" />

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push('/creator')}
                        className="hidden sm:inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-sm font-medium text-slate-400 transition-all hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
                    >
                        My Drops
                    </button>
                    <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs font-mono text-slate-400">
                        <div className="h-2 w-2 rounded-full bg-[#22D3EE] animate-pulse" />
                        {selectedChain.name}
                    </div>
                    <Wallet>
                        <ConnectWallet className="rounded-full border border-[#0052FF]/25 bg-gradient-to-r from-[#0052FF]/15 to-[#22D3EE]/10 px-3 py-2 text-white !min-w-0 font-medium transition-all hover:from-[#0052FF]/25 hover:to-[#22D3EE]/20 hover:border-[#0052FF]/40 hover:shadow-[0_0_20px_rgba(0,82,255,0.15)]">
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
                            <WalletDropdownDisconnect className="text-red-400 hover:bg-red-500/10 transition-colors w-full flex items-center justify-center py-3 font-semibold" text="Disconnect" />
                        </WalletDropdown>
                    </Wallet>
                </div>
            </nav>

            <main className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 pt-12">
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
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[#0052FF]/25 bg-[#0052FF]/10 mb-2">
                            <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#22D3EE]" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <h1 className="font-display text-4xl font-extrabold tracking-tight">Connect your Wallet</h1>
                        <p className="text-slate-400 max-w-md mx-auto">Connect your wallet to configure and deploy an ERC-1155 Drop on {selectedChain.name}.</p>
                        <Wallet>
                            <ConnectWallet className="bg-gradient-to-r from-[#0052FF] to-[#22D3EE] text-white font-bold hover:scale-[1.03] active:scale-95 transition-all shadow-[0_0_30px_rgba(0,82,255,0.35)] px-8 py-3 rounded-full !min-w-[200px]">
                                <Avatar className="h-6 w-6" />
                                <Name />
                            </ConnectWallet>
                        </Wallet>
                    </div>
                ) : (
                    <>
                        <div className="mb-12">
                            <div className="mb-3 inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200/70">
                                Create Drop
                            </div>
                            <h1 className="font-display text-4xl font-extrabold tracking-tight mb-3">Launch your Drop</h1>
                            <p className="text-slate-400">Configure your {selectedChain.name} ERC-1155 contract and unlockable content.</p>
                        </div>

                        {/* Stepper */}
                        <div className="flex items-center gap-3 mb-12">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="flex items-center gap-3 flex-1">
                                    <div
                                        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all duration-300 ${step >= i
                                            ? "bg-gradient-to-br from-[#0052FF] to-[#22D3EE] text-white shadow-[0_0_20px_rgba(0,82,255,0.35)]"
                                            : step === i - 1
                                                ? "border border-[#0052FF]/30 bg-[#0052FF]/10 text-[#22D3EE]"
                                                : "border border-white/[0.06] bg-white/[0.02] text-slate-600"
                                            }`}
                                    >
                                        {step > i ? (
                                            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" /></svg>
                                        ) : i}
                                    </div>
                                    {i !== 4 && <div className={`h-[2px] w-full rounded-full transition-all duration-300 ${step > i ? "bg-gradient-to-r from-[#0052FF] to-[#22D3EE]/50" : "bg-white/[0.04]"}`} />}
                                </div>
                            ))}
                        </div>

                        {/* Form Container */}
                        <div className="rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-8 shadow-[0_0_0_1px_rgba(0,82,255,0.04),0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl">
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
                                    <div className="mb-2">
                                        <h3 className="font-display text-lg font-bold text-white">Drop Details</h3>
                                        <p className="text-sm text-slate-500">Give your drop a name, tell its story, and upload the artwork.</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Drop Title</label>
                                        <input
                                            type="text"
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#0052FF]/50 focus:shadow-[0_0_0_3px_rgba(0,82,255,0.1)] transition-all"
                                            placeholder="e.g. The Farcaster Genesis"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
                                        <textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#0052FF]/50 focus:shadow-[0_0_0_3px_rgba(0,82,255,0.1)] transition-all h-32 resize-none"
                                            placeholder="Tell the story behind this drop..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Artwork Image</label>
                                        <p className="text-xs text-slate-500 mb-3">PNG, JPG, or WebP · Max {MAX_UPLOAD_SIZE_LABEL}</p>
                                        <div className="group relative rounded-2xl border-2 border-dashed border-white/[0.08] p-8 text-center transition-all hover:border-[#0052FF]/30 hover:bg-[#0052FF]/[0.02] cursor-pointer">
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
                                                            className="max-h-[250px] max-w-full object-contain rounded-xl border border-white/[0.08] shadow-[0_0_30px_rgba(0,82,255,0.15)]"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#0052FF]/20 bg-[#0052FF]/8 text-[#22D3EE] transition-transform group-hover:scale-110">
                                                        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 16V7" /><path d="M8.5 10.5L12 7l3.5 3.5" /><rect x="4" y="16" width="16" height="4" rx="1.5" /></svg>
                                                    </div>
                                                )}
                                                <span className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">
                                                    {file ? file.name : "Click to upload artwork"}
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step === 2 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="mb-2">
                                        <h3 className="font-display text-lg font-bold text-white">Pricing & Config</h3>
                                        <p className="text-sm text-slate-500">Set your edition size, mint price, and optional locked content.</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">Edition Size</label>
                                            <input
                                                type="number"
                                                min="1" max="10000"
                                                value={formData.editionSize}
                                                onChange={(e) => {
                                                    let val = e.target.value;
                                                    if (val !== "" && parseInt(val, 10) > 10000) {
                                                        val = "10000";
                                                    }
                                                    setFormData({ ...formData, editionSize: val });
                                                }}
                                                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-white focus:outline-none focus:border-[#0052FF]/50 focus:shadow-[0_0_0_3px_rgba(0,82,255,0.1)] transition-all"
                                            />
                                            <p className="text-xs text-slate-600 mt-2">Between 1 and 10,000</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">Mint Price (ETH)</label>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                min="0"
                                                value={formData.mintPrice}
                                                onChange={(e) => setFormData({ ...formData, mintPrice: e.target.value })}
                                                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-white focus:outline-none focus:border-[#0052FF]/50 focus:shadow-[0_0_0_3px_rgba(0,82,255,0.1)] transition-all"
                                            />
                                            <p className="text-xs text-slate-600 mt-2">Set to 0 for Free Mints</p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Payout Recipient</label>
                                        <input
                                            type="text"
                                            value={formData.payoutRecipient}
                                            onChange={(e) => setFormData({ ...formData, payoutRecipient: e.target.value })}
                                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#0052FF]/50 focus:shadow-[0_0_0_3px_rgba(0,82,255,0.1)] transition-all font-mono disabled:opacity-50"
                                            placeholder={address ? address : "0x..."}
                                        />
                                        <p className="text-xs text-slate-600 mt-2">Defaults to your connected wallet.</p>
                                    </div>

                                    <div className="rounded-2xl border border-[#7C3AED]/15 bg-gradient-to-b from-[#7C3AED]/[0.06] to-transparent p-5">
                                        <div className="flex items-center gap-2 mb-1">
                                            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#7C3AED]" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                                            <h4 className="font-semibold text-[#7C3AED] text-sm">Locked Content (Mint-to-Unlock)</h4>
                                        </div>
                                        <p className="text-xs text-slate-500 mb-4">Secret message only visible to wallets that own the NFT. Text only — no URLs.</p>
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
                                            className="w-full rounded-xl border border-[#7C3AED]/20 bg-[#0B1020]/80 px-4 py-3 text-[#22D3EE] font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-[#7C3AED]/40 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)] transition-all h-32 resize-none"
                                            placeholder="e.g. The secret password for the event is 'BASE'"
                                        />
                                    </div>
                                </div>
                            )}

                            {step === 3 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="text-center mb-8">
                                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#0052FF]/25 bg-[#0052FF]/10">
                                            <svg viewBox="0 0 24 24" className="h-7 w-7 text-[#22D3EE]" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                        </div>
                                        <h3 className="font-display text-xl font-bold mb-2">Creator Identity</h3>
                                        <p className="text-sm text-slate-400 max-w-md mx-auto">Link a Farcaster handle via wallet signature. This is optional — not KYC.</p>
                                    </div>

                                    <div className="rounded-2xl border border-[#0052FF]/15 bg-gradient-to-b from-[#0052FF]/[0.05] to-transparent p-6 space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-[#22D3EE]/80 mb-2">Handle / Username</label>
                                            <div className="relative">
                                                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-[#0052FF]/50 font-mono">@</span>
                                                <input
                                                    type="text"
                                                    value={formData.farcasterHandle}
                                                    onChange={(e) => setFormData({ ...formData, farcasterHandle: e.target.value.replace(/[^a-zA-Z0-9_.-]/g, '') })}
                                                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] pl-10 pr-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#0052FF]/50 focus:shadow-[0_0_0_3px_rgba(0,82,255,0.1)] transition-all font-mono disabled:opacity-50"
                                                    placeholder="e.g. jesse.base"
                                                    disabled={identityVerified}
                                                />
                                            </div>
                                        </div>

                                        <div className="pt-2">
                                            {identityVerified ? (
                                                <div className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/[0.06] p-4 text-green-400">
                                                    <svg viewBox="0 0 16 16" className="h-5 w-5 shrink-0" fill="currentColor"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm3.22 4.72a.75.75 0 00-1.06.02L7.4 8.78 5.84 7.22a.75.75 0 00-1.08 1.04l2.1 2.1a.75.75 0 001.07-.01l3.3-3.55a.75.75 0 00-.01-1.08z" /></svg>
                                                    <span className="font-semibold text-sm">Linked to @{formData.farcasterHandle}</span>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={handleLinkIdentity}
                                                    disabled={!formData.farcasterHandle || isLinkingIdentity}
                                                    className="w-full rounded-xl border border-[#0052FF]/25 bg-[#0052FF]/10 py-3 font-bold text-[#22D3EE] transition-all hover:bg-[#0052FF]/20 hover:border-[#0052FF]/40 disabled:opacity-30 disabled:pointer-events-none"
                                                >
                                                    {isLinkingIdentity ? "Signing..." : "Link handle via signature"}
                                                </button>
                                            )}
                                        </div>

                                        <p className="text-[11px] text-slate-600 text-center leading-relaxed mt-4">
                                            Wallet-signature proof only. Not official Farcaster verification and not KYC.
                                        </p>
                                    </div>

                                    {!identityVerified && (
                                        <div className="text-center mt-4">
                                            <button onClick={handleNext} className="text-sm text-slate-500 hover:text-white underline decoration-white/20 transition-colors">Skip and Continue Anonymously</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {step === 4 && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="text-center">
                                        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0052FF]/20 to-[#22D3EE]/15 border border-[#22D3EE]/20">
                                            <svg viewBox="0 0 24 24" className="h-9 w-9 text-[#22D3EE]" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        </div>
                                        <h2 className="font-display text-2xl font-bold mb-2">Ready to Deploy</h2>
                                        <p className="text-slate-400">Review your drop details before signing the {selectedChain.name} transaction.</p>
                                    </div>

                                    {!hasSelectedChainContractConfig && (
                                        <div className="p-4 bg-yellow-500/10 border border-yellow-500/40 rounded-xl text-yellow-200 text-sm">
                                            Deployment is disabled: missing factory/implementation configuration for {selectedChain.name}.
                                        </div>
                                    )}

                                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 space-y-0 font-mono text-sm">
                                        <div className="flex justify-between border-b border-white/[0.06] py-4">
                                            <span className="text-slate-500">Title</span>
                                            <span className="text-white font-medium">{formData.title || "Untitled"}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/[0.06] py-4">
                                            <span className="text-slate-500">Supply</span>
                                            <span className="text-white">{formData.editionSize}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/[0.06] py-4">
                                            <span className="text-slate-500">Price</span>
                                            <span className={Number(formData.mintPrice) === 0 ? "text-[#22D3EE] font-bold" : "text-white"}>{Number(formData.mintPrice) === 0 ? "Free mint" : `${formData.mintPrice} ETH`}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/[0.06] py-4">
                                            <span className="text-slate-500">Recipient</span>
                                            <span className="text-white truncate max-w-[150px] sm:max-w-xs">{formData.payoutRecipient.trim() ? formData.payoutRecipient.trim() : address}</span>
                                        </div>
                                        <div className="flex justify-between py-4">
                                            <span className="text-slate-500">Est. Deploy Gas</span>
                                            <span className="text-[#22D3EE] font-medium">{deployGasEstimate ? (deployGasEstimate === "Unknown" ? "Unknown" : `~${parseFloat(deployGasEstimate).toFixed(4)} ETH`) : "Estimating..."}</span>
                                        </div>
                                    </div>

                                    {/* Share-Card Preview */}
                                    <div className="rounded-2xl border border-white/[0.06] bg-[#05070f] overflow-hidden">
                                        <div className="px-6 py-4 border-b border-white/[0.06] bg-white/[0.02]">
                                            <h3 className="text-sm font-semibold text-white">Share Card Preview</h3>
                                            <p className="text-xs text-slate-500">This is how your drop will look when shared on Warpcast or X.</p>
                                        </div>
                                        <div className="p-6 flex justify-center bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.15),transparent_40%),radial-gradient(circle_at_top_left,rgba(124,58,237,0.15),transparent_40%)]">
                                            <div className="w-full max-w-[500px] flex flex-col items-center">
                                                <div className="w-full aspect-[1.91/1] rounded-t-xl border border-white/10 border-b-0 flex p-6 relative overflow-hidden bg-black/40 backdrop-blur-md shadow-2xl">
                                                    <div className="w-[40%] rounded-xl overflow-hidden border border-white/10 shrink-0 bg-[#0B1020] flex items-center justify-center p-1 relative shadow-inner">
                                                        {file ? (
                                                            <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-contain rounded-lg drop-shadow-md" />
                                                        ) : draftImageUrl ? (
                                                            <img src={draftImageUrl.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')} alt="" className="w-full h-full object-contain rounded-lg drop-shadow-md" />
                                                        ) : (
                                                            <div className="text-4xl font-bold text-white/50">{formData.title.charAt(0).toUpperCase() || "D"}</div>
                                                        )}
                                                    </div>
                                                    <div className="ml-6 flex-1 flex flex-col justify-between py-1">
                                                        <div>
                                                            <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wider mb-2">
                                                                <span className="px-2 py-1 rounded-full bg-[#16a34a]/20 text-[#4ade80] border border-[#16a34a]/30">LIVE</span>
                                                            </div>
                                                            <h1 className="text-xl font-bold text-white leading-tight line-clamp-2">{formData.title || "Untitled Drop"}</h1>
                                                            <div className="mt-2 text-sm text-[#22D3EE] font-medium bg-[#0B1020]/80 border border-[#22D3EE]/30 rounded-lg px-3 py-1.5 inline-block">
                                                                {Number(formData.mintPrice) === 0 ? "Free" : `${formData.mintPrice} ETH`}
                                                            </div>
                                                        </div>
                                                        <div className="text-xs text-slate-400">
                                                            <div className="mb-1">Creator: {formData.farcasterHandle ? `@${formData.farcasterHandle}` : (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Unknown")}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Frame Buttons Mockup */}
                                                <div className="w-full flex gap-2 pt-2 border border-white/10 border-t-0 bg-black/40 px-2 pb-2 rounded-b-xl shadow-2xl">
                                                    <div className="flex-1 relative group cursor-default">
                                                        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#0052FF] via-[#7C3AED] to-[#FF4D8D] opacity-60 blur-md" />
                                                        <div className="relative h-full bg-gradient-to-r from-[#0052FF] via-[#7C3AED] to-[#FF4D8D] text-center py-2.5 rounded-lg border border-white/20 text-sm font-bold text-white transition-transform hover:scale-[1.02]">
                                                            Mint 1
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 bg-gradient-to-r from-[#0052FF]/20 to-[#22D3EE]/20 hover:from-[#0052FF]/30 hover:to-[#22D3EE]/30 text-center py-2.5 rounded-lg border border-[#22D3EE]/30 text-sm font-semibold text-white cursor-default transition-all shadow-[0_0_15px_rgba(34,211,238,0.1)]">
                                                        Open mint page
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}



                            {/* Action Buttons */}
                            <div className="mt-10 flex justify-between items-center pt-6 border-t border-white/[0.06]">
                                <button
                                    onClick={handlePrev}
                                    disabled={step === 1}
                                    className={`px-6 py-2.5 rounded-full font-medium transition-all ${step === 1 ? "opacity-0 pointer-events-none" : "text-slate-400 hover:text-white border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/15"
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
                                        className="px-8 py-2.5 rounded-full bg-white text-[#05070f] font-bold hover:scale-[1.03] active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)]"
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
                                        className="px-8 py-2.5 rounded-full bg-gradient-to-r from-[#0052FF] to-[#22D3EE] text-white font-bold hover:scale-[1.03] active:scale-95 transition-all shadow-[0_0_30px_rgba(0,82,255,0.4)] disabled:opacity-50 disabled:pointer-events-none"
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
