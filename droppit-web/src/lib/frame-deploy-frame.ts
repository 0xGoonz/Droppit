import { NextResponse } from "next/server";
import { getFrameHtmlResponse, FrameButton } from "@/lib/frame-builder";
import {
    DeployDraft,
    buildCreateDropTxPayload,
    extractTxHashFromPayload,
    prepareDeployFromDraft,
    resolveFinalizeTxHash,
    resolveDropAddressFromReceipt,
    validateFramePayloadWithNeynar,
} from "@/lib/frame-deploy";
import { getServiceRoleClient } from "@/lib/supabase";
import { validateLockedContent, validateTxHash } from "@/lib/validation/drops";

export const DEPLOY_DRAFT_SELECT =
    "id, status, title, edition_size, mint_price, payout_recipient, creator_address, token_uri, image_url, locked_content_draft, contract_address, deploy_salt, deploy_commitment";

type RenderFrameArgs = {
    buttons: FrameButton[];
    imageSrc: string;
    postUrl: string;
    inputText?: string;
    status?: number;
};

type BasicFrameContext = {
    baseUrl: string;
    postUrl: string;
};

type DraftFrameContext = BasicFrameContext & {
    draftId: string;
};

type DraftPreviewFrameContext = DraftFrameContext & {
    txTarget: string;
    createUrl: string;
    ogImageUrl: string;
    showInput: boolean;
};

type DraftSuccessFrameContext = BasicFrameContext & {
    contractAddress: string;
};

type TxBuildContext = BasicFrameContext & {
    fallbackTarget: string;
    fallbackImageSrc: string;
    draft: DeployDraft;
    body: unknown;
};

type FinalizeContext = BasicFrameContext & {
    requestUrl: string;
    fallbackTarget: string;
    fallbackImageSrc: string;
    draft: DeployDraft;
    body: unknown;
};

function renderFrame({ buttons, imageSrc, postUrl, inputText, status }: RenderFrameArgs): NextResponse {
    return new NextResponse(
        getFrameHtmlResponse({
            buttons,
            image: { src: imageSrc },
            postUrl,
            inputText,
        }),
        {
            status: status || 200,
            headers: { "Content-Type": "text/html" },
        }
    );
}

function normalizeHexString(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (!/^(0x)?[a-fA-F0-9]+$/.test(trimmed)) return null;
    return trimmed;
}

function extractInputText(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;
    const untrustedData = (body as Record<string, unknown>).untrustedData;
    if (!untrustedData || typeof untrustedData !== "object") return null;
    const rawInput = (untrustedData as Record<string, unknown>).inputText;
    if (typeof rawInput !== "string") return null;
    const trimmed = rawInput.trim();
    return trimmed || null;
}

function extractMessageBytes(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;
    const trustedData = (body as Record<string, unknown>).trustedData;
    if (!trustedData || typeof trustedData !== "object") return null;
    return normalizeHexString((trustedData as Record<string, unknown>).messageBytes);
}

function buildTxPayloadFallbackResponse({
    baseUrl,
    postUrl,
    fallbackTarget,
    fallbackImageSrc,
    message,
    status,
}: {
    baseUrl: string;
    postUrl: string;
    fallbackTarget: string;
    fallbackImageSrc: string;
    message: string;
    status?: number;
}): NextResponse {
    console.warn(`[Frame Deploy TX] ${message}`);
    return renderFrame({
        buttons: [{ action: "link", label: "Fix draft on Droppit", target: fallbackTarget }],
        imageSrc: fallbackImageSrc || `${baseUrl}/api/og/drop/fallback`,
        postUrl,
        status,
    });
}

export function renderInvalidDraftFrame({
    baseUrl,
    postUrl,
    target,
    imageSrc,
}: BasicFrameContext & { target?: string; imageSrc?: string }): NextResponse {
    return renderFrame({
        buttons: [{ action: "link", label: "Create on Droppit", target: target || `${baseUrl}/create` }],
        imageSrc: imageSrc || `${baseUrl}/api/og/drop/fallback`,
        postUrl,
    });
}

export function renderDraftPreviewFrame({
    postUrl,
    txTarget,
    createUrl,
    ogImageUrl,
    showInput,
}: DraftPreviewFrameContext): NextResponse {
    return renderFrame({
        buttons: [
            { action: "tx", label: "Deploy Drop", target: txTarget },
            { action: "link", label: "Upload Hi-Res", target: createUrl },
        ],
        imageSrc: ogImageUrl,
        postUrl,
        inputText: showInput ? "Enter secret unlockable message (optional)" : undefined,
    });
}

export function renderLiveDropFrame({
    baseUrl,
    postUrl,
    draftId,
    contractAddress,
    imageSrc,
}: DraftFrameContext & { contractAddress: string | null; imageSrc: string }): NextResponse {
    const createUrl = `${baseUrl}/create?draftId=${draftId}`;
    const dropUrl = contractAddress ? `${baseUrl}/drop/base/${contractAddress}` : createUrl;
    return renderFrame({
        buttons: [{ action: "link", label: "View Live Drop", target: dropUrl }],
        imageSrc,
        postUrl,
    });
}

export function renderDeploySuccessFrame({
    baseUrl,
    postUrl,
    contractAddress,
}: DraftSuccessFrameContext): NextResponse {
    const dropUrl = `${baseUrl}/drop/base/${contractAddress}`;
    const statsUrl = `${dropUrl}/stats`;

    return renderFrame({
        buttons: [
            { action: "link", label: "View Live Drop", target: dropUrl },
            { action: "link", label: "View Stats", target: statsUrl },
        ],
        imageSrc: `${baseUrl}/api/og/drop/${contractAddress}`,
        postUrl,
    });
}

export async function stageDraftSecretFromFrameInput(draftId: string, creatorAddress: string, body: unknown): Promise<boolean> {
    const inputText = extractInputText(body);
    if (!inputText) return false;

    const messageBytes = extractMessageBytes(body);
    if (!messageBytes) {
        // Item 10: scrub — never log the inputText value
        console.error("[Frame Deploy] Staging failed: missing messageBytes for draft", draftId);
        return false;
    }

    try {
        const validation = await validateFramePayloadWithNeynar(messageBytes);
        if (!validation.valid || !validation.wallet) {
            console.error("[Frame Deploy] Staging failed: invalid Neynar signature for draft", draftId);
            return false;
        }

        // Ensure only the creator can stage the secret
        if (validation.wallet.toLowerCase() !== creatorAddress.toLowerCase()) {
            // Item 10: log only the wallet mismatch, never the secret content
            console.error(`[Frame Deploy] Staging failed: wallet mismatch for draft ${draftId}`);
            return false;
        }
    } catch (error) {
        // Item 10: do not log the raw error which may contain secret fields
        console.error("[Frame Deploy] Staging failed: Neynar validation error for draft", draftId);
        return false;
    }

    const lockedCheck = validateLockedContent(inputText);
    if (!lockedCheck.valid || !lockedCheck.value) return false;

    // Item 9: Encrypt the secret before persisting to DB
    let encryptedValue: string;
    try {
        const { encryptSecret } = await import("@/lib/encryption");
        encryptedValue = encryptSecret(lockedCheck.value);
    } catch (encErr) {
        console.error("[Frame Deploy] Encryption failed for draft", draftId);
        return false;
    }

    const supabaseAdmin = getServiceRoleClient();
    await supabaseAdmin
        .from("drops")
        .update({
            locked_content_draft: encryptedValue,
            deploy_salt: null,
            deploy_commitment: null,
        })
        .eq("id", draftId)
        .eq("status", "DRAFT");

    return true;
}

export async function buildDeployTxFrameResponse({
    baseUrl,
    postUrl,
    fallbackTarget,
    fallbackImageSrc,
    draft,
    body,
}: TxBuildContext): Promise<NextResponse> {
    const messageBytes = extractMessageBytes(body);
    if (!messageBytes) {
        return buildTxPayloadFallbackResponse({
            baseUrl,
            postUrl,
            fallbackTarget,
            fallbackImageSrc,
            message: "Rejected tx payload request: missing trustedData.messageBytes.",
            status: 400,
        });
    }

    let validation: { valid: boolean; wallet: `0x${string}` | null };
    try {
        const result = await validateFramePayloadWithNeynar(messageBytes);
        validation = { valid: result.valid, wallet: result.wallet };
    } catch (error) {
        console.error("[Frame Deploy TX] Neynar validation error:", error);
        return buildTxPayloadFallbackResponse({
            baseUrl,
            postUrl,
            fallbackTarget,
            fallbackImageSrc,
            message: "Neynar validation request failed.",
            status: 502,
        });
    }

    if (!validation.valid) {
        return buildTxPayloadFallbackResponse({
            baseUrl,
            postUrl,
            fallbackTarget,
            fallbackImageSrc,
            message: "Rejected tx payload request: invalid frame signature.",
            status: 400,
        });
    }

    const prepared = prepareDeployFromDraft(draft, validation.wallet, "tx-build");
    if (!prepared.ok) {
        return buildTxPayloadFallbackResponse({
            baseUrl,
            postUrl,
            fallbackTarget,
            fallbackImageSrc,
            message: prepared.error,
            status: 400,
        });
    }

    if (prepared.value.draftDeployStatePatch) {
        const supabaseAdmin = getServiceRoleClient();
        const { error: stageError } = await supabaseAdmin
            .from("drops")
            .update(prepared.value.draftDeployStatePatch)
            .eq("id", draft.id)
            .eq("status", "DRAFT");

        if (stageError) {
            console.error("[Frame Deploy TX] Failed to stage deploy salt/commitment:", stageError);
            return buildTxPayloadFallbackResponse({
                baseUrl,
                postUrl,
                fallbackTarget,
                fallbackImageSrc,
                message: "Unable to stage deploy metadata before transaction build.",
                status: 500,
            });
        }
    }

    return NextResponse.json(buildCreateDropTxPayload(prepared.value));
}

export async function finalizeDeployFromFrameCallback({
    requestUrl,
    baseUrl,
    postUrl,
    fallbackTarget,
    fallbackImageSrc,
    draft,
    body,
}: FinalizeContext): Promise<NextResponse | null> {
    const callbackPayloadTxHash = extractTxHashFromPayload(body);

    const messageBytes = extractMessageBytes(body);
    if (!messageBytes) {
        return buildTxPayloadFallbackResponse({
            baseUrl,
            postUrl,
            fallbackTarget,
            fallbackImageSrc,
            message: "Rejected callback: trustedData.messageBytes missing.",
            status: 400,
        });
    }

    let validationResult: {
        valid: boolean;
        wallet: `0x${string}` | null;
        txHash: string | null;
    };
    try {
        validationResult = await validateFramePayloadWithNeynar(messageBytes);
    } catch (error) {
        console.error("[Frame Deploy] Neynar callback validation error:", error);
        return buildTxPayloadFallbackResponse({
            baseUrl,
            postUrl,
            fallbackTarget,
            fallbackImageSrc,
            message: "Neynar validation request failed during callback.",
            status: 502,
        });
    }

    if (!validationResult.valid) {
        return buildTxPayloadFallbackResponse({
            baseUrl,
            postUrl,
            fallbackTarget,
            fallbackImageSrc,
            message: "Rejected callback: invalid frame signature.",
            status: 400,
        });
    }

    const txHashSelection = resolveFinalizeTxHash(validationResult.txHash, callbackPayloadTxHash);
    if (txHashSelection.kind === "none") {
        return null;
    }
    if (txHashSelection.kind === "mismatch") {
        return NextResponse.json({ error: txHashSelection.error }, { status: 400 });
    }

    const txHashCheck = validateTxHash(txHashSelection.txHash);
    if (!txHashCheck.valid) {
        return buildTxPayloadFallbackResponse({
            baseUrl,
            postUrl,
            fallbackTarget,
            fallbackImageSrc,
            message: txHashCheck.error,
            status: 400,
        });
    }

    const prepared = prepareDeployFromDraft(draft, validationResult.wallet, "finalize");
    if (!prepared.ok) {
        return buildTxPayloadFallbackResponse({
            baseUrl,
            postUrl,
            fallbackTarget,
            fallbackImageSrc,
            message: prepared.error,
            status: 400,
        });
    }

    let contractAddress: `0x${string}`;
    try {
        contractAddress = await resolveDropAddressFromReceipt(
            txHashCheck.value as `0x${string}`,
            prepared.value.factoryAddress
        );
    } catch (error) {
        console.error("[Frame Deploy] Failed to resolve deployed address from tx:", error);
        return buildTxPayloadFallbackResponse({
            baseUrl,
            postUrl,
            fallbackTarget,
            fallbackImageSrc,
            message: "Unable to resolve deployed drop from transaction receipt.",
            status: 409,
        });
    }

    const publishPayload: Record<string, unknown> = {
        txHash: txHashCheck.value,
        contractAddress,
        tokenUri: prepared.value.tokenUri,
        imageUrl: prepared.value.imageUrl,
        farcasterWallet: validationResult.wallet,
    };
    if (prepared.value.salt) {
        publishPayload.salt = prepared.value.salt;
        publishPayload.commitment = prepared.value.commitment;
    }

    const publishUrl = new URL(`/api/drops/${draft.id}/publish`, requestUrl).toString();
    const publishResponse = await fetch(publishUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(publishPayload),
    });

    if (!publishResponse.ok && publishResponse.status !== 409) {
        const publishBody = await publishResponse.text().catch(() => "");
        console.error("[Frame Deploy] Publish finalize failed:", publishResponse.status, publishBody);
        return buildTxPayloadFallbackResponse({
            baseUrl,
            postUrl,
            fallbackTarget,
            fallbackImageSrc,
            message: "Unable to finalize deploy state.",
            status: 500,
        });
    }

    if (publishResponse.status === 409) {
        const supabaseAdmin = getServiceRoleClient();
        const { data: existing } = await supabaseAdmin
            .from("drops")
            .select("status, contract_address")
            .eq("id", draft.id)
            .maybeSingle();

        if (existing?.status === "LIVE" && typeof existing.contract_address === "string" && existing.contract_address) {
            return renderDeploySuccessFrame({
                baseUrl,
                postUrl,
                contractAddress: existing.contract_address,
            });
        }
    }

    return renderDeploySuccessFrame({
        baseUrl,
        postUrl,
        contractAddress,
    });
}
