"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatEther, parseEther, keccak256, encodePacked, isAddress } from "viem";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_LABEL, ALLOWED_MIME_ACCEPT, MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT, MAX_IMAGE_PIXELS } from "@/lib/constants/upload";
import { validateImageMedia, extractImageDimensions, type ImageDimensions } from "@/lib/media-validation";
import { validateLockedContent } from "@/lib/validation/drops";
import { useAccount, useDisconnect, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useSignMessage, usePublicClient } from "wagmi";
import {
    ConnectWallet,
    Wallet,
} from '@coinbase/onchainkit/wallet';
import {
    Avatar,
    Name,
} from '@coinbase/onchainkit/identity';
import { FACTORY_ABI } from "@/lib/contracts";
import { useChainPreference } from "@/providers/OnchainKitProvider";
import { AppShell } from "@/components/layout/AppShell";
import { AppNav } from "@/components/layout/AppNav";
import { publishDropDraft } from "@/lib/publish-drop";
import { normalizeIpfsToHttp } from "@/lib/og-utils";
import { fitArtworkWithinBounds, MINIAPP_SHARE_CARD } from "@/lib/share-card-layout";
import {
    getSessionStorageSafe,
    hasSelectedChainMismatch,
    shouldShowMiniAppConnectingState,
    suppressMiniAppAutoConnect,
} from "@/lib/miniapp-wallet";
import {
    PRIVATE_DRAFT_ACCESS_MESSAGE,
    hasReusableDraftMedia,
    mapDraftLoadFailure,
    parseDraftLaunchMode,
    resolveDraftEntryBehavior,
    resolveDraftLoadStatus,
    shouldFetchDraft,
    type DraftLaunchMode,
    type DraftLoadRequestStatus,
} from "@/lib/draft-load";
import { Step1Details } from "@/components/create/Step1Details";
import { Step2Config } from "@/components/create/Step2Config";
import { Step3Identity } from "@/components/create/Step3Identity";
import { Step4Review } from "@/components/create/Step4Review";

export default function CreateDrop() {
    const [step, setStep] = useState(1);
    const [draftId, setDraftId] = useState<string | null>(null);
    const [draftMode, setDraftMode] = useState<DraftLaunchMode | null>(null);
    const [autoDeploy, setAutoDeploy] = useState(false);
    const [hasResolvedDraftParams, setHasResolvedDraftParams] = useState(false);
    const [draftLoadRequestStatus, setDraftLoadRequestStatus] = useState<DraftLoadRequestStatus>("idle");
    const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
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
    const [isPublishingDrop, setIsPublishingDrop] = useState(false);

    // Auto-save specific states
    const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
    const hasRestoredDraftRef = useRef(false);

    // Pre-existing IPFS URIs hydrated from draft (skip re-upload when available)
    const [draftImageUrl, setDraftImageUrl] = useState<string | null>(null);
    const [draftTokenUri, setDraftTokenUri] = useState<string | null>(null);
    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
    const [fileImageDimensions, setFileImageDimensions] = useState<ImageDimensions | null>(null);
    const [draftImageDimensions, setDraftImageDimensions] = useState<ImageDimensions | null>(null);

    const [deployGasEstimate, setDeployGasEstimate] = useState<string | null>(null);

    const deployFiredRef = useRef(false);
    const publishFiredRef = useRef<string | null>(null);
    const initialDraftEntryKeyRef = useRef<string | null>(null);
    const {
        selectedChain,
        selectedChainId,
        hasSelectedChainContractConfig,
        chainContracts,
        isMiniAppEnvironment,
        isMiniAppWalletBootstrapping,
    } = useChainPreference();
    const selectedFactoryAddress = chainContracts?.factoryAddress || "";
    const publicClient = usePublicClient({ chainId: selectedChainId });

    const { address, chainId } = useAccount();
    const router = useRouter();
    const { data: hash, writeContractAsync, isPending } = useWriteContract();
    const { switchChainAsync } = useSwitchChain();
    const { disconnect } = useDisconnect();
    const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
    const normalizedDraftImageUrl = normalizeIpfsToHttp(draftImageUrl);
    const [isSwitchingChain, setIsSwitchingChain] = useState(false);
    const toPreviewPercent = (value: number, total: number) => `${((value / total) * 100).toFixed(2)}%`;
    const hasConnectedWallet = Boolean(address);
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
    const draftLoadStatus = resolveDraftLoadStatus({
        draftId,
        address,
        requestStatus: draftLoadRequestStatus,
    });
    const hasReusableMedia = hasReusableDraftMedia(draftTokenUri, draftImageUrl);
    const hasArtworkReady = Boolean(file || hasReusableMedia);
    const draftEntryBehavior = resolveDraftEntryBehavior({
        mode: draftMode,
        hasReusableMedia,
    });
    const isAiDraftFlow = draftMode !== null;
    const hasHydrated = hasResolvedDraftParams && draftLoadStatus === "loaded";
    const hydrationError = draftLoadStatus === "private"
        ? PRIVATE_DRAFT_ACCESS_MESSAGE
        : draftLoadStatus === "error"
            ? draftLoadError
            : null;
    const isDraftLoading = Boolean(draftId) && draftLoadStatus === "loading";
    const shouldBlockDraftReview = Boolean(address) && Boolean(draftId) && draftLoadStatus !== "loaded";
    const showMissingArtworkBanner = draftEntryBehavior.showMissingArtworkBanner && !hasArtworkReady;
    const handleWalletDisconnect = useCallback(() => {
        suppressMiniAppAutoConnect(getSessionStorageSafe());
        disconnect();
    }, [disconnect]);
    const handleSwitchToSelectedChain = useCallback(async () => {
        setFormError(null);
        setIsSwitchingChain(true);
        try {
            await switchChainAsync({ chainId: selectedChain.id });
        } catch (error) {
            const message = error instanceof Error ? error.message : `Switch to ${selectedChain.name} to continue.`;
            setFormError(message);
        } finally {
            setIsSwitchingChain(false);
        }
    }, [selectedChain, switchChainAsync]);

    useEffect(() => {
        if (!file) {
            setFilePreviewUrl(null);
            return;
        }

        const objectUrl = URL.createObjectURL(file);
        setFilePreviewUrl(objectUrl);

        return () => {
            URL.revokeObjectURL(objectUrl);
        };
    }, [file]);

    useEffect(() => {
        if (file || !normalizedDraftImageUrl) {
            if (!file) setDraftImageDimensions(null);
            return;
        }

        let isActive = true;
        const image = new window.Image();

        image.onload = () => {
            if (!isActive) return;
            setDraftImageDimensions({
                width: image.naturalWidth || 1,
                height: image.naturalHeight || 1,
            });
        };
        image.onerror = () => {
            if (!isActive) return;
            setDraftImageDimensions(null);
        };
        image.src = normalizedDraftImageUrl;

        return () => {
            isActive = false;
            image.onload = null;
            image.onerror = null;
        };
    }, [file, normalizedDraftImageUrl]);

    // Parse draftId and auto from URL on mount.
    useEffect(() => {
        if (typeof window === "undefined" || hasResolvedDraftParams) return;

        const searchParams = new URLSearchParams(window.location.search);
        const nextDraftId = searchParams.get("draftId");
        const nextDraftMode = parseDraftLaunchMode(searchParams.get("mode"));
        const auto = searchParams.get("auto");

        setDraftId(nextDraftId);
        setDraftMode(nextDraftMode);
        setAutoDeploy(auto === "1");
        setHasResolvedDraftParams(true);
    }, [hasResolvedDraftParams]);

    // Hydrate draft data only after the creator wallet is available.
    useEffect(() => {
        if (!hasResolvedDraftParams) return;

        if (!draftId) {
            setDraftLoadRequestStatus("idle");
            setDraftLoadError(null);
            return;
        }

        if (!shouldFetchDraft({ draftId, address })) {
            setDraftLoadRequestStatus("idle");
            setDraftLoadError(null);
            return;
        }

        const controller = new AbortController();
        let isActive = true;

        setDraftLoadRequestStatus("loading");
        setDraftLoadError(null);

        fetch(`/api/drops/${draftId}`, {
            headers: { "x-creator-address": address as string },
            signal: controller.signal,
        })
            .then(async (res) => {
                const body = await res.json().catch(() => ({}));
                if (!res.ok) {
                    const failure = mapDraftLoadFailure(
                        res.status,
                        typeof body?.error === "string" ? body.error : null
                    );
                    const error = new Error(failure.message) as Error & {
                        draftLoadStatus?: DraftLoadRequestStatus;
                    };
                    error.draftLoadStatus = failure.status;
                    throw error;
                }
                return body;
            })
            .then((data) => {
                if (!isActive) return;

                setFormData((prev) => ({
                    ...prev,
                    title: typeof data.title === "string" ? data.title : prev.title,
                    description: typeof data.description === "string" ? data.description : prev.description,
                    editionSize: typeof data.editionSize === "string" ? data.editionSize : prev.editionSize,
                    mintPrice: typeof data.mintPriceWei === "string" ? formatEther(BigInt(data.mintPriceWei)) : prev.mintPrice,
                    payoutRecipient: typeof data.payoutRecipient === "string" ? data.payoutRecipient : prev.payoutRecipient,
                    lockedContent: typeof data.lockedContent === "string" ? data.lockedContent : prev.lockedContent,
                }));
                setDraftImageUrl(data.imageUrl || null);
                setDraftTokenUri(data.tokenUri || null);
                setDraftLoadError(null);
                setDraftLoadRequestStatus("loaded");
            })
            .catch((err: unknown) => {
                if (!isActive) return;
                if (err instanceof Error && err.name === "AbortError") return;

                console.error("[CreateDrop] Hydration failed:", err);
                setAutoDeploy(false);

                const draftError = err as Error & {
                    draftLoadStatus?: DraftLoadRequestStatus;
                };
                const message = draftError.message || "Failed to load draft data.";
                const nextStatus = draftError.draftLoadStatus === "private"
                    ? "private"
                    : "error";

                setDraftLoadRequestStatus(nextStatus);
                setDraftLoadError(
                    nextStatus === "private"
                        ? PRIVATE_DRAFT_ACCESS_MESSAGE
                        : message
                );
            });

        return () => {
            isActive = false;
            controller.abort();
        };
    }, [hasResolvedDraftParams, draftId, address]);

    useEffect(() => {
        if (!draftId) {
            initialDraftEntryKeyRef.current = null;
            return;
        }

        if (!hasHydrated) return;

        const entryKey = `${draftId}:${draftMode ?? "legacy"}`;
        if (initialDraftEntryKeyRef.current === entryKey) return;

        if (draftEntryBehavior.initialStep !== null) {
            setStep(draftEntryBehavior.initialStep);
        }

        initialDraftEntryKeyRef.current = entryKey;
    }, [draftEntryBehavior.initialStep, draftId, draftMode, hasHydrated]);

    useEffect(() => {
        if (!isSuccess || !receipt || !deployedState || !selectedFactoryAddress) return;

        const dropCreatedLog = receipt.logs.find(log => log.address.toLowerCase() === selectedFactoryAddress.toLowerCase());
        if (!dropCreatedLog || !dropCreatedLog.topics[2]) {
            setFormError("Deployment confirmed, but Droppit could not resolve the deployed drop address.");
            return;
        }

        const rawAddress = dropCreatedLog.topics[2];
        const dropAddress = "0x" + rawAddress.slice(-40);
        const publishKey = `${deployedState.draftId}:${receipt.transactionHash}:${dropAddress.toLowerCase()}`;
        if (publishFiredRef.current === publishKey) return;
        publishFiredRef.current = publishKey;

        let isActive = true;
        const finalizePublish = async () => {
            if (isActive) {
                setIsPublishingDrop(true);
                setFormError(null);
            }

            try {
                await publishDropDraft({
                    draftId: deployedState.draftId,
                    txHash: receipt.transactionHash,
                    contractAddress: dropAddress,
                    tokenUri: deployedState.tokenUri,
                    imageUrl: deployedState.imageUri,
                    lockedContent: formData.lockedContent,
                    salt: deployedState.salt,
                    commitment: deployedState.commitment,
                    creatorWallet: address,
                });
                router.push(`/drop/base/${dropAddress}`);
            } catch (err) {
                console.error("Publish failed:", err);
                publishFiredRef.current = null;
                if (isActive) {
                    setFormError(err instanceof Error ? err.message : "Publish failed. Please retry from the creator dashboard.");
                }
            } finally {
                if (isActive) setIsPublishingDrop(false);
            }
        };

        void finalizePublish();
        return () => {
            isActive = false;
        };
    }, [address, isSuccess, receipt, router, deployedState, formData.lockedContent, selectedFactoryAddress]);

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

    // ---------------------------------------------------------------------------
    // Auto-save logic (Local Drafts)
    // ---------------------------------------------------------------------------
    const LOCAL_DRAFT_KEY = 'droppit_local_draft';

    // 1. Restore local draft on mount (only if NOT an AI draft flow)
    useEffect(() => {
        if (hasRestoredDraftRef.current) return;
        
        // Wait until initial draft params have been parsed from URL
        if (!hasResolvedDraftParams) return;
        
        // Don't interfere with AI drafts
        if (draftId) return; 
        
        try {
            const saved = sessionStorage.getItem(LOCAL_DRAFT_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    setFormData(prev => ({ ...prev, ...parsed }));
                }
            }
        } catch (e) {
            console.warn("Failed to parse local draft", e);
        }
        hasRestoredDraftRef.current = true;
    }, [hasResolvedDraftParams, draftId]);

    // 2. Auto-save form data when it changes
    useEffect(() => {
        // Only save after initial hydration/restoration to avoid overwriting with empty
        if (!hasHydrated && hasRestoredDraftRef.current === false) return;
        // Don't auto save if we are deployed/publishing or reviewing
        if (deployedState || isPublishingDrop || step === 4) return;
        
        const debounce = setTimeout(() => {
            try {
                sessionStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(formData));
                setLastSavedTime(new Date());
            } catch (e) {
                console.warn("Failed to persist local draft", e);
            }
        }, 1000);
        
        return () => clearTimeout(debounce);
    }, [formData, hasHydrated, deployedState, isPublishingDrop, step]);
    // ---------------------------------------------------------------------------

    const handleNext = useCallback(() => setStep((s) => Math.min(s + 1, 4)), []);
    const handlePrev = useCallback(() => setStep((s) => Math.max(s - 1, 1)), []);

    const handleNextStepWithValidation = useCallback(() => {
        if (step === 1 && (!formData.title.trim() || !hasArtworkReady)) {
            setFormError("Please provide a Drop Title and artwork media to proceed.");
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
                if (!isAddress(formData.payoutRecipient.trim())) {
                    setFormError("Payout Recipient is not a valid EVM address.");
                    return;
                }
            }
        }

        if (step === 3 && formData.farcasterHandle && !identityVerified) {
            setFormError("Please link your entered handle via signature, or clear the box completely to skip anonymously.");
            return;
        }

        setFormError(null);
        handleNext();
    }, [step, formData, hasArtworkReady, identityVerified, handleNext]);

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
            let message = "Failed to successfully verify identity.";
            if (e instanceof Error) {
                if (e.message.includes("User rejected the request") || e.message.includes("User denied message signature")) {
                    message = "Signature request cancelled by user.";
                } else {
                    message = e.message;
                }
            }
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
        // Art is required unless the draft already has reusable media.
        if (!hasArtworkReady) {
            setFormError("Upload artwork to continue.");
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
            if (chainId !== selectedChain.id) {
                throw new Error(`Switch to ${selectedChain.name} to deploy.`);
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

            // 3. Resolve IPFS URIs - reuse draft values or upload fresh
            let tokenUri: string;
            let imageUri: string;

            if (!file && draftTokenUri && draftImageUrl) {
                // Draft already has IPFS URIs from a prior upload; skip re-upload
                tokenUri = draftTokenUri;
                imageUri = draftImageUrl;
            } else if (file) {
                // 1. Fetch Temporary JWT from backend (Vercel payload bypass)
                const tokenRes = await fetch("/api/upload/token", { method: "POST" });
                if (!tokenRes.ok) throw new Error("Failed to secure upload token. Please try again.");
                const tokenData = await tokenRes.json();

                // 2. Upload Image Directly to Pinata
                const uploadData = new FormData();
                uploadData.append("file", file);

                const pinataUploadRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${tokenData.JWT}`,
                    },
                    body: uploadData,
                });

                if (!pinataUploadRes.ok) throw new Error("Artwork upload to IPFS failed.");
                const imageUploadResult = await pinataUploadRes.json();
                imageUri = `ipfs://${imageUploadResult.IpfsHash}`;

                // 3. Upload Metadata directly to Pinata
                const metadata = {
                    name: formData.title || "Untitled Drop",
                    description: formData.description || "Created via Droppit",
                    image: imageUri,
                    properties: { generator: "Droppit AgentKit" },
                };

                const metadataRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${tokenData.JWT}`,
                    },
                    body: JSON.stringify({ pinataContent: metadata }),
                });

                if (!metadataRes.ok) throw new Error("Metadata upload to IPFS failed.");
                const jsonUploadResult = await metadataRes.json();
                tokenUri = `ipfs://${jsonUploadResult.IpfsHash}`;
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
            let message = "Deployment failed";
            if (e instanceof Error) {
                if (e.message.includes("User rejected the request") || e.message.includes("User denied transaction signature")) {
                    message = "Transaction cancelled by user.";
                } else if (e.message.includes("insufficient funds")) {
                    message = "Insufficient funds to cover gas fees.";
                } else {
                    message = e.message;
                }
            }
            setFormError(message);
            // Reset the one-shot guard so user can retry after fixing the issue
            deployFiredRef.current = false;
        } finally {
            setIsUploading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address, hasArtworkReady, hasSelectedChainContractConfig, selectedFactoryAddress, selectedChain, file, chainId, formData, draftId, hasHydrated, draftTokenUri, draftImageUrl]);

    // Auto-deploy: trigger deploy only after all prerequisites are met
    useEffect(() => {
        if (!autoDeploy || !hasHydrated || hydrationError) return;
        if (deployFiredRef.current || isUploading || isPending || isConfirming || isSuccess) return;
        if (!hasSelectedChainContractConfig || !selectedFactoryAddress) return;

        if (address && hasArtworkReady && chainId === selectedChain.id && !formError) {
            setAutoDeploy(false);
            handleDeploy();
        }
    }, [autoDeploy, hasArtworkReady, hasHydrated, hydrationError, address, chainId, formError, isUploading, isPending, isConfirming, isSuccess, handleDeploy, hasSelectedChainContractConfig, selectedFactoryAddress, selectedChain]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd+Enter or Ctrl+Enter to advance / deploy
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (step < 4) {
                    handleNextStepWithValidation();
                } else {
                    if (
                        !shouldPromptForChainSwitch &&
                        hasSelectedChainContractConfig &&
                        hasHydrated &&
                        !hydrationError &&
                        !isUploading &&
                        !isPending &&
                        !isConfirming &&
                        !isSuccess &&
                        !isPublishingDrop &&
                        !isSwitchingChain
                    ) {
                        handleDeploy();
                    }
                }
            }

            // Esc to go back or close
            if (e.key === "Escape") {
                e.preventDefault();
                if (step > 1) {
                    handlePrev();
                } else {
                    router.push('/creator');
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        step,
        handleNextStepWithValidation,
        handlePrev,
        handleDeploy,
        router,
        shouldPromptForChainSwitch,
        hasSelectedChainContractConfig,
        hasHydrated,
        hydrationError,
        isUploading,
        isPending,
        isConfirming,
        isSuccess,
        isPublishingDrop,
        isSwitchingChain
    ]);

    const previewTitle = formData.title.trim() || "Untitled Drop";
    const previewGlyph = previewTitle.charAt(0).toUpperCase() || "D";
    const previewImageUrl = filePreviewUrl || normalizedDraftImageUrl;
    const previewImageDimensions = file ? fileImageDimensions : draftImageDimensions;
    const previewArtworkPlacement = fitArtworkWithinBounds({
        imageWidth: previewImageDimensions?.width,
        imageHeight: previewImageDimensions?.height,
    });
    const previewArtworkFrameStyle = previewImageUrl
        ? previewImageDimensions
            ? {
                width: (previewArtworkPlacement.widthRatio * 100).toFixed(2) + "%",
                height: (previewArtworkPlacement.heightRatio * 100).toFixed(2) + "%",
            }
            : { width: "100%", height: "100%" }
        : null;
    const previewFrameInset = toPreviewPercent(MINIAPP_SHARE_CARD.frameInset, MINIAPP_SHARE_CARD.canvasWidth);
    const previewArtPaddingX = toPreviewPercent(MINIAPP_SHARE_CARD.artPaddingX, MINIAPP_SHARE_CARD.canvasWidth);
    const previewArtPaddingTop = toPreviewPercent(MINIAPP_SHARE_CARD.artPaddingTop, MINIAPP_SHARE_CARD.canvasHeight);
    const previewArtPaddingBottom = toPreviewPercent(MINIAPP_SHARE_CARD.artPaddingBottom, MINIAPP_SHARE_CARD.canvasHeight);


    return (
        <AppShell className="pb-20">
            <AppNav
                actionButton={
                    <button
                        type="button"
                        onClick={() => router.push('/creator')}
                        className="relative z-20 inline-flex shrink-0 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition-all hover:border-white/15 hover:bg-white/[0.06] hover:text-white sm:px-4 sm:text-sm"
                    >
                        My Drops
                    </button>
                }
                rightContent={
                    <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs font-mono text-slate-400">
                        <div className="h-2 w-2 rounded-full bg-[#22D3EE] animate-pulse" />
                        {selectedChain.name}
                    </div>
                }
                onDisconnect={() => disconnect()}
            />

            <main className="relative z-10 mx-auto max-w-3xl px-4 pt-8 pb-28 sm:px-6 sm:pt-12">
                                {/* Hydration loading / error indicators */}
                {isDraftLoading && address && (
                    <div className="mb-8 p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-xl animate-in fade-in slide-in-from-top-2">
                        <h3 className="text-yellow-400 font-bold mb-2">Loading Draft</h3>
                        <p className="text-yellow-200 text-sm">Fetching your draft data, please wait.</p>
                    </div>
                )}
                {autoDeploy && !hydrationError && (
                    <div className="mb-8 p-4 bg-blue-500/10 border border-blue-500/50 rounded-xl animate-in fade-in slide-in-from-top-2">
                        <h3 className="text-blue-400 font-bold mb-2">⚡ Auto-Deploy Pending</h3>
                        <p className="text-blue-200 text-sm mb-2">Please complete the following to automatically finish your drop:</p>
                        <ul className="list-disc list-inside text-sm text-blue-300">
                            {!hasHydrated && <li>Loading draft data…</li>}
                            {!address && showMiniAppWalletConnecting && <li>Connecting wallet…</li>}
                            {!address && !showMiniAppWalletConnecting && <li>Connect your wallet</li>}
                            {address && shouldPromptForChainSwitch && <li>Switch to {selectedChain.name} in your wallet</li>}
                            {!hasSelectedChainContractConfig && <li>{selectedChain.name} deployment config is missing.</li>}
                            {!hasArtworkReady && <li>Upload artwork media</li>}
                        </ul>
                    </div>
                )}
                {!address ? (
                    <div className="flex min-h-[320px] flex-col items-center justify-center space-y-5 text-center animate-in fade-in slide-in-from-bottom-4 duration-500 sm:min-h-[400px] sm:space-y-6">
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[#0052FF]/25 bg-[#0052FF]/10 mb-2">
                            <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#22D3EE]" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{showMiniAppWalletConnecting ? "Connecting wallet..." : draftId ? "Connect Creator Wallet" : "Connect your Wallet"}</h1>
                        <p className="mx-auto max-w-md text-sm text-slate-400 sm:text-base">{showMiniAppWalletConnecting ? `Attempting Farcaster wallet auto-connect for ${selectedChain.name}${draftId ? " to load your draft." : "."}` : draftId ? `Connect the creator wallet used to create this draft to review or deploy it on ${selectedChain.name}.` : `Connect your wallet to configure and deploy an ERC-1155 Drop on ${selectedChain.name}.`}</p>
                        {showMiniAppWalletConnecting ? (
                            <div className="rounded-full border border-[#22D3EE]/25 bg-[#22D3EE]/10 px-5 py-3 text-sm font-semibold text-[#9FEAF8]">
                                Please wait while Droppit connects your Farcaster wallet.
                            </div>
                        ) : (
                            <Wallet>
                                <ConnectWallet className="w-full max-w-xs rounded-full bg-gradient-to-r from-[#0052FF] to-[#22D3EE] px-8 py-3 text-white !min-w-[200px] font-bold transition-all hover:scale-[1.03] active:scale-95 shadow-[0_0_30px_rgba(0,82,255,0.35)]">
                                    <Avatar className="h-6 w-6" />
                                    <Name />
                                </ConnectWallet>
                            </Wallet>
                        )}
                    </div>
                ) : shouldBlockDraftReview ? (
                    <div className="flex min-h-[320px] flex-col items-center justify-center space-y-5 text-center animate-in fade-in slide-in-from-bottom-4 duration-500 sm:min-h-[400px] sm:space-y-6">
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[#0052FF]/25 bg-[#0052FF]/10 mb-2">
                            <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#22D3EE]" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                            {isDraftLoading ? "Loading draft..." : draftLoadStatus === "private" ? "Draft Access Restricted" : "Draft Load Failed"}
                        </h1>
                        <p className="mx-auto max-w-md text-sm text-slate-400 sm:text-base">
                            {isDraftLoading
                                ? "Fetching the private draft details for the connected wallet."
                                : draftLoadStatus === "private"
                                    ? PRIVATE_DRAFT_ACCESS_MESSAGE
                                    : (draftLoadError || "Droppit could not load this draft right now.")}
                        </p>
                        {draftLoadStatus === "private" && (
                            <button
                                type="button"
                                onClick={handleWalletDisconnect}
                                className="rounded-full border border-[#22D3EE]/25 bg-[#22D3EE]/10 px-5 py-3 text-sm font-semibold text-[#9FEAF8] transition-colors hover:bg-[#22D3EE]/15"
                            >
                                Disconnect wallet
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="mb-10 flex items-start justify-between sm:mb-12">
                            <div>
                                <div className="mb-3 inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200/70">
                                    {isAiDraftFlow ? "AI Draft Review" : "Create Drop"}
                                </div>
                                <h1 className="mb-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{isAiDraftFlow ? "Review AI Draft" : "Launch your Drop"}</h1>
                                <p className="text-slate-400">
                                    {isAiDraftFlow
                                        ? `Review the AI-generated draft for ${selectedChain.name}. This draft is still editable before deployment.`
                                        : `Configure your ${selectedChain.name} ERC-1155 contract and unlockable content.`}
                                </p>
                            </div>

                            {/* Auto-save indicator */}
                            <div className={`mt-2 hidden sm:flex items-center gap-1.5 rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/5 px-3 py-1.5 text-xs font-medium text-[#22D3EE] transition-opacity duration-1000 ${lastSavedTime ? 'opacity-100' : 'opacity-0'}`}>
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                <span>Draft saved</span>
                            </div>
                        </div>

                        {/* Mobile Auto-save indicator */}
                        <div className={`mb-6 flex sm:hidden items-center justify-center gap-1.5 rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/5 px-3 py-1.5 text-xs font-medium text-[#22D3EE] transition-opacity duration-1000 ${lastSavedTime ? 'opacity-100' : 'opacity-0'}`}>
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <span>Draft saved locally</span>
                        </div>

                        {/* Stepper */}
                        <div className="mb-8 flex items-center gap-2 sm:mb-12 sm:gap-3">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="flex flex-1 items-center gap-2 sm:gap-3">
                                    <div
                                        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 sm:h-10 sm:w-10 sm:text-sm ${step >= i
                                            ? "bg-gradient-to-br from-[#0052FF] to-[#22D3EE] text-white shadow-[0_0_20px_rgba(0,82,255,0.35)]"
                                            : step === i - 1
                                                ? "border border-[#0052FF]/30 bg-[#0052FF]/10 text-[#22D3EE]"
                                                : "border border-white/[0.06] bg-white/[0.02] text-slate-600"
                                            } ${step > i ? "step-complete-bounce" : ""}`}
                                    >
                                        {step > i ? (
                                            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" /></svg>
                                        ) : i}
                                    </div>
                                    {i !== 4 && <div className={`h-px w-full rounded-full transition-all duration-500 ease-out sm:h-[2px] ${step > i ? "bg-gradient-to-r from-[#0052FF] to-[#22D3EE]/50" : "bg-white/[0.04]"}`} />}
                                </div>
                            ))}
                        </div>

                        {/* Form Container */}
                        <div className="rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-5 shadow-[0_0_0_1px_rgba(0,82,255,0.04),0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-8">
                            {/* Error Message Display */}
                            {formError && (
                                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl animate-in fade-in slide-in-from-top-2">
                                    <p className="text-red-400 font-semibold text-center text-sm">
                                        Warning: {formError}
                                    </p>
                                </div>
                            )}

                            {step === 1 && (
                                <Step1Details
                                    isAiDraftFlow={isAiDraftFlow}
                                    hasReusableMedia={hasReusableMedia}
                                    showMissingArtworkBanner={showMissingArtworkBanner}
                                    formData={formData}
                                    setFormData={setFormData}
                                    file={file}
                                    setFile={setFile}
                                    setFileImageDimensions={setFileImageDimensions}
                                    setFormError={setFormError}
                                    filePreviewUrl={filePreviewUrl}
                                    normalizedDraftImageUrl={normalizedDraftImageUrl}
                                />
                            )}

                            {step === 2 && (
                                <Step2Config
                                    formData={formData}
                                    setFormData={setFormData}
                                    setFormError={setFormError}
                                    address={address}
                                />
                            )}

                            {step === 3 && (
                                <Step3Identity
                                    formData={formData}
                                    setFormData={setFormData}
                                    identityVerified={identityVerified}
                                    isLinkingIdentity={isLinkingIdentity}
                                    handleLinkIdentity={handleLinkIdentity}
                                    handleNext={handleNext}
                                />
                            )}

                            {step === 4 && (
                                <Step4Review
                                    isAiDraftFlow={isAiDraftFlow}
                                    selectedChain={selectedChain}
                                    formData={formData}
                                    address={address}
                                    hasSelectedChainContractConfig={hasSelectedChainContractConfig}
                                    deployGasEstimate={deployGasEstimate}
                                    previewImageUrl={previewImageUrl}
                                    previewGlyph={previewGlyph}
                                    previewFrameInset={previewFrameInset}
                                    previewArtPaddingTop={previewArtPaddingTop}
                                    previewArtPaddingX={previewArtPaddingX}
                                    previewArtPaddingBottom={previewArtPaddingBottom}
                                    previewArtworkFrameStyle={previewArtworkFrameStyle}
                                />
                            )}


                            {/* Action Buttons */}
                            <div className="mt-10 flex flex-col gap-3 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center sm:justify-between">
                                <button
                                    onClick={handlePrev}
                                    disabled={step === 1}
                                    className={`rounded-full px-6 py-2.5 font-medium transition-all ${step === 1 ? "hidden sm:inline-flex sm:opacity-0 sm:pointer-events-none" : "inline-flex w-full items-center justify-center border border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/15 hover:bg-white/[0.06] hover:text-white sm:w-auto"
                                        }`}
                                >
                                    Back
                                </button>

                                {step < 4 ? (
                                    <button
                                        onClick={() => {
                                            if (step === 1 && (!formData.title.trim() || !hasArtworkReady)) {
                                                setFormError("Please provide a Drop Title and artwork media to proceed.");
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
                                        className="inline-flex w-full items-center justify-center rounded-full bg-white px-8 py-2.5 font-bold text-[#05070f] transition-all hover:scale-[1.03] active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.15)] sm:w-auto"
                                    >
                                        Next Step
                                    </button>
                                ) : (
                                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
                                        {shouldPromptForChainSwitch && (
                                            <div className="w-full rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 sm:max-w-sm">
                                                <p>Connected wallet is on the wrong network. Switch to {selectedChain.name} before deploying.</p>
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
                                            onClick={handleDeploy}
                                            disabled={shouldPromptForChainSwitch || !hasSelectedChainContractConfig || !hasHydrated || !!hydrationError || isUploading || isPending || isConfirming || isSuccess || isPublishingDrop || isSwitchingChain}
                                            className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#0052FF] to-[#22D3EE] px-8 py-2.5 font-bold text-white transition-all hover:scale-[1.03] active:scale-95 shadow-[0_0_30px_rgba(0,82,255,0.4)] disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
                                        >
                                            {shouldPromptForChainSwitch
                                                ? `Switch to ${selectedChain.name} to Deploy`
                                                : !hasSelectedChainContractConfig
                                                    ? "Chain Config Missing"
                                                    : !hasHydrated
                                                        ? "Loading draft…"
                                                        : isUploading
                                                            ? "Uploading to IPFS..."
                                                            : (isPending || isConfirming)
                                                                ? "Confirming tx..."
                                                                : isSuccess
                                                                    ? (isPublishingDrop
                                                                        ? "Finalizing drop..."
                                                                        : (formError ? "Publish incomplete" : "Awaiting publish..."))
                                                                    : (isAiDraftFlow ? "Approve & Deploy" : "Sign & Deploy")}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </main>
        </AppShell>
    );
}










