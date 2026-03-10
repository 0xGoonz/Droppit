import { createPublicClient, decodeEventLog, encodeFunctionData, encodePacked, http, isAddress, keccak256, toBytes } from "viem";
import { base } from "viem/chains";
import { randomBytes } from "crypto";
import { FACTORY_ABI, getChainContracts } from "@/lib/contracts";
import { validateEditionSize, validateEvmAddress, validateLockedContent, validateMintPriceWei, validateTxHash } from "@/lib/validation/drops";

const FRAME_MVP_CHAIN_ID = 8453;
const FRAME_MVP_CHAIN_ID_EIP155 = "eip155:8453";

const activeChain = base;
const alchemyNetwork = "base-mainnet";
const rpcUrl = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
    ? `https://${alchemyNetwork}.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    : undefined;

const publicClient = createPublicClient({
    chain: activeChain,
    transport: http(rpcUrl),
});

const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;
const DROP_CREATED_EVENT_TOPIC0 = keccak256(
    toBytes("DropCreated(address,address,uint256,uint256,address,address,uint256,string)")
);
const DROP_CREATED_EVENT_ABI = [
    {
        type: "event",
        name: "DropCreated",
        inputs: [
            { name: "creator", type: "address", indexed: true },
            { name: "drop", type: "address", indexed: true },
            { name: "editionSize", type: "uint256", indexed: false },
            { name: "mintPrice", type: "uint256", indexed: false },
            { name: "payoutRecipient", type: "address", indexed: false },
            { name: "protocolFeeRecipient", type: "address", indexed: false },
            { name: "protocolFeePerMint", type: "uint256", indexed: false },
            { name: "tokenUri", type: "string", indexed: false },
        ],
    },
] as const;

export type DeployDraft = {
    id: string;
    status: string;
    title: string | null;
    edition_size: number | null;
    mint_price: string | null;
    payout_recipient: string | null;
    creator_address: string | null;
    token_uri: string | null;
    image_url: string | null;
    locked_content_draft: string | null;
    contract_address: string | null;
    deploy_salt: string | null;
    deploy_commitment: string | null;
};

type DraftDeployStatePatch = {
    deploy_salt: `0x${string}` | null;
    deploy_commitment: `0x${string}` | null;
};

export type PreparedDeploy = {
    draftId: string;
    chainId: number;
    factoryAddress: `0x${string}`;
    editionSize: number;
    mintPriceWei: string;
    payoutRecipient: `0x${string}`;
    tokenUri: string;
    imageUrl: string | null;
    lockedContent: string | null;
    salt: `0x${string}` | null;
    commitment: `0x${string}`;
    draftDeployStatePatch: DraftDeployStatePatch | null;
};

type PrepareMode = "tx-build" | "finalize";

function normalizeBytes32Hex(raw: unknown): `0x${string}` | null {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) return null;
    return `0x${trimmed.slice(2).toLowerCase()}` as `0x${string}`;
}

function deriveLockedContentCommitment(salt: `0x${string}`, lockedContent: string): `0x${string}` {
    return keccak256(encodePacked(["bytes32", "string"], [salt, lockedContent]));
}

function generateRandomSalt(): `0x${string}` {
    return `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
}

function normalizeCandidateAddress(raw: unknown): `0x${string}` | null {
    if (!raw || typeof raw !== "string") return null;
    const check = validateEvmAddress(raw, "wallet");
    if (!check.valid) return null;
    return check.value as `0x${string}`;
}

export function getActiveFrameChainId(): number {
    return FRAME_MVP_CHAIN_ID;
}

export function extractTxHashFromPayload(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    const untrustedData = b.untrustedData && typeof b.untrustedData === "object"
        ? (b.untrustedData as Record<string, unknown>)
        : {};
    const action = b.action && typeof b.action === "object"
        ? (b.action as Record<string, unknown>)
        : {};
    const transaction = action.transaction && typeof action.transaction === "object"
        ? (action.transaction as Record<string, unknown>)
        : {};

    const candidates = [
        untrustedData.transactionId,
        untrustedData.transactionHash,
        b.transactionId,
        b.transactionHash,
        transaction.hash,
    ];

    for (const candidate of candidates) {
        if (typeof candidate !== "string") continue;
        const direct = validateTxHash(candidate);
        if (direct.valid) return direct.value;

        const matched = candidate.match(/0x[a-fA-F0-9]{64}/);
        if (!matched) continue;
        const extracted = validateTxHash(matched[0]);
        if (extracted.valid) return extracted.value;
    }

    return null;
}

type FinalizeTxHashSelection =
    | { kind: "none" }
    | { kind: "selected"; txHash: string }
    | { kind: "mismatch"; error: string };

export function resolveFinalizeTxHash(
    validationTxHash: string | null,
    callbackPayloadTxHash: string | null
): FinalizeTxHashSelection {
    const validationHash = validationTxHash?.trim() || null;
    const callbackHash = callbackPayloadTxHash?.trim() || null;

    if (validationHash && callbackHash && validationHash.toLowerCase() !== callbackHash.toLowerCase()) {
        return {
            kind: "mismatch",
            error: "Transaction hash mismatch between Neynar-validated payload and callback payload. Possible tampering detected.",
        };
    }

    if (validationHash) {
        return { kind: "selected", txHash: validationHash };
    }

    if (callbackHash) {
        return { kind: "selected", txHash: callbackHash };
    }

    return { kind: "none" };
}

export function prepareDeployFromDraft(
    draft: DeployDraft,
    frameWallet: `0x${string}` | null,
    mode: PrepareMode = "tx-build"
): { ok: true; value: PreparedDeploy } | { ok: false; error: string } {
    if (draft.status !== "DRAFT") {
        return { ok: false, error: "This draft is no longer deployable." };
    }

    const editionCheck = validateEditionSize(draft.edition_size);
    if (!editionCheck.valid) return { ok: false, error: editionCheck.error };

    const priceCheck = validateMintPriceWei(draft.mint_price || "0");
    if (!priceCheck.valid) return { ok: false, error: priceCheck.error };

    const tokenUri = typeof draft.token_uri === "string" ? draft.token_uri.trim() : "";
    if (!tokenUri) {
        return { ok: false, error: "Draft is missing metadata/token URI. Upload artwork and metadata before deploying." };
    }

    const chainContracts = getChainContracts(FRAME_MVP_CHAIN_ID);
    const factoryAddress = chainContracts?.factoryAddress;
    if (!factoryAddress || !isAddress(factoryAddress)) {
        return { ok: false, error: `${activeChain.name} factory configuration is missing.` };
    }

    const payoutRecipient =
        normalizeCandidateAddress(draft.payout_recipient) ||
        normalizeCandidateAddress(draft.creator_address) ||
        frameWallet;
    if (!payoutRecipient) {
        return { ok: false, error: "Missing payout recipient wallet. Set a payout wallet before deploying." };
    }

    const lockedCheck = validateLockedContent(draft.locked_content_draft);
    if (!lockedCheck.valid) return { ok: false, error: lockedCheck.error };

    const hasStoredDeployState =
        typeof draft.deploy_salt === "string" ||
        typeof draft.deploy_commitment === "string";
    const storedSalt = normalizeBytes32Hex(draft.deploy_salt);
    const storedCommitment = normalizeBytes32Hex(draft.deploy_commitment);

    let salt: `0x${string}` | null = null;
    let commitment = ZERO_BYTES32 as `0x${string}`;
    let draftDeployStatePatch: DraftDeployStatePatch | null = null;

    if (lockedCheck.value) {
        if (mode === "finalize") {
            if (!storedSalt || !storedCommitment) {
                return {
                    ok: false,
                    error: "Missing staged deploy salt/commitment for locked content. Rebuild the deploy transaction before finalizing.",
                };
            }
            salt = storedSalt;
            commitment = storedCommitment;
        } else {
            const storedMatchesLockedContent =
                !!storedSalt &&
                !!storedCommitment &&
                deriveLockedContentCommitment(storedSalt, lockedCheck.value).toLowerCase() === storedCommitment.toLowerCase();

            if (storedMatchesLockedContent) {
                salt = storedSalt;
                commitment = storedCommitment;
            } else {
                salt = generateRandomSalt();
                commitment = deriveLockedContentCommitment(salt, lockedCheck.value);
                draftDeployStatePatch = {
                    deploy_salt: salt,
                    deploy_commitment: commitment,
                };
            }
        }
    } else if (mode === "tx-build" && hasStoredDeployState) {
        draftDeployStatePatch = {
            deploy_salt: null,
            deploy_commitment: null,
        };
    }

    return {
        ok: true,
        value: {
            draftId: draft.id,
            chainId: FRAME_MVP_CHAIN_ID,
            factoryAddress: factoryAddress as `0x${string}`,
            editionSize: editionCheck.value,
            mintPriceWei: priceCheck.value,
            payoutRecipient,
            tokenUri,
            imageUrl: draft.image_url || null,
            lockedContent: lockedCheck.value,
            salt,
            commitment,
            draftDeployStatePatch,
        },
    };
}

export function buildCreateDropTxPayload(prepared: PreparedDeploy) {
    const data = encodeFunctionData({
        abi: FACTORY_ABI,
        functionName: "createDrop",
        args: [
            BigInt(prepared.editionSize),
            BigInt(prepared.mintPriceWei),
            prepared.payoutRecipient,
            prepared.tokenUri,
            prepared.commitment,
        ],
    });

    return {
        chainId: FRAME_MVP_CHAIN_ID_EIP155,
        method: "eth_sendTransaction",
        params: {
            abi: FACTORY_ABI,
            to: prepared.factoryAddress,
            data,
            value: "0",
        },
    };
}

export async function resolveDropAddressFromReceipt(
    txHash: `0x${string}`,
    factoryAddress: `0x${string}`
): Promise<`0x${string}`> {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
        throw new Error("Deployment transaction has not succeeded onchain yet.");
    }

    const dropCreatedLog = receipt.logs.find(
        (log) =>
            log.address.toLowerCase() === factoryAddress.toLowerCase() &&
            (log.topics[0]?.toLowerCase() || "") === DROP_CREATED_EVENT_TOPIC0.toLowerCase()
    );
    if (!dropCreatedLog) {
        throw new Error("No DropCreated event found for the factory in this deployment transaction.");
    }

    let decodedDropAddress: unknown;
    try {
        const decoded = decodeEventLog({
            abi: DROP_CREATED_EVENT_ABI,
            data: dropCreatedLog.data,
            topics: dropCreatedLog.topics,
            strict: true,
        });
        decodedDropAddress = decoded.args.drop;
    } catch {
        throw new Error("Failed to decode DropCreated event from deployment transaction logs.");
    }

    if (typeof decodedDropAddress !== "string" || !isAddress(decodedDropAddress)) {
        throw new Error("DropCreated event did not contain a valid indexed drop address.");
    }

    return decodedDropAddress as `0x${string}`;
}

export function extractFrameWalletFromValidation(validationData: unknown): `0x${string}` | null {
    if (!validationData || typeof validationData !== "object") return null;
    const data = validationData as Record<string, unknown>;
    const action = data.action && typeof data.action === "object"
        ? (data.action as Record<string, unknown>)
        : {};
    const interactor = action.interactor && typeof action.interactor === "object"
        ? (action.interactor as Record<string, unknown>)
        : {};

    const verifiedAccountsRaw = interactor.verified_accounts;
    if (Array.isArray(verifiedAccountsRaw)) {
        for (const account of verifiedAccountsRaw) {
            const normalized = normalizeCandidateAddress(account);
            if (normalized) return normalized;
        }
    }

    return normalizeCandidateAddress(interactor.custody_address);
}

export async function validateFramePayloadWithNeynar(messageBytes: string): Promise<{
    valid: boolean;
    buttonIndex: number;
    wallet: `0x${string}` | null;
    txHash: string | null;
}> {
    const neynarRes = await fetch("https://api.neynar.com/v2/farcaster/frame/validate", {
        method: "POST",
        headers: {
            "api_key": process.env.NEYNAR_API_KEY || "",
            "content-type": "application/json",
        },
        body: JSON.stringify({ message_bytes_in_hex: messageBytes }),
    });
    const data = await neynarRes.json();
    const buttonIndex = data?.action?.tapped_button?.index || 0;

    return {
        valid: !!data?.valid,
        buttonIndex,
        wallet: extractFrameWalletFromValidation(data),
        txHash: extractTxHashFromPayload(data),
    };
}
