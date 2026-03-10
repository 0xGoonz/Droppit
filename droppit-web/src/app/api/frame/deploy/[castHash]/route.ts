import { NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import type { DeployDraft } from "@/lib/frame-deploy";
import { renderDeployFramePage } from "@/lib/frame-deploy-page";
import {
    DEPLOY_DRAFT_SELECT,
    finalizeDeployFromFrameCallback,
    renderDraftPreviewFrame,
    renderInvalidDraftFrame,
    renderLiveDropFrame,
    stageDraftSecretFromFrameInput,
} from "@/lib/frame-deploy-frame";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ castHash: string }> }
) {
    const resolvedParams = await params;
    const castHash = resolvedParams.castHash;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://droppitonbase.xyz";
    return renderDeployFramePage({ castHash, baseUrl });
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ castHash: string }> }
) {
    const resolvedParams = await params;
    const castHash = resolvedParams.castHash;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://droppitonbase.xyz";
    const postUrl = `${baseUrl}/api/frame/deploy/${castHash}`;

    try {
        const supabaseAdmin = getServiceRoleClient();
        const { data: draft, error } = await supabaseAdmin
            .from("drops")
            .select(DEPLOY_DRAFT_SELECT)
            .eq("cast_hash", castHash)
            .maybeSingle();

        if (error || !draft) {
            return renderInvalidDraftFrame({ baseUrl, postUrl });
        }

        void supabaseAdmin.from("analytics_events").insert({
            event: "frame_button_click",
            drop_id: draft.id,
            contract_address: draft.contract_address || null,
            metadata: { cast_hash: castHash, status: draft.status },
        }).then(({ error: analyticsError }) => {
            if (analyticsError) console.warn("[Frame Analytics] Insert failed:", analyticsError.message);
        });

        const draftId = draft.id;
        const createUrl = `${baseUrl}/create?draftId=${draftId}`;
        const ogImageUrl = `${baseUrl}/api/og/draft/${draftId}`;
        const txUrl = `${baseUrl}/api/frame/deploy/${castHash}/tx`;

        if (draft.status === "LIVE") {
            return renderLiveDropFrame({
                baseUrl,
                postUrl,
                draftId,
                contractAddress: draft.contract_address,
                imageSrc: ogImageUrl,
            });
        }

        if (draft.status !== "DRAFT") {
            return renderInvalidDraftFrame({
                baseUrl,
                postUrl,
                target: createUrl,
                imageSrc: ogImageUrl,
            });
        }

        const body = await req.json().catch(() => null);

        if (body) {
            const finalizedResponse = await finalizeDeployFromFrameCallback({
                requestUrl: req.url,
                baseUrl,
                postUrl,
                fallbackTarget: createUrl,
                fallbackImageSrc: ogImageUrl,
                draft: draft as DeployDraft,
                body,
            });
            if (finalizedResponse) return finalizedResponse;
        }

        const secretHandled = body ? await stageDraftSecretFromFrameInput(draftId, draft.creator_address || "", body) : false;

        return renderDraftPreviewFrame({
            baseUrl,
            postUrl,
            draftId,
            txTarget: txUrl,
            createUrl,
            ogImageUrl,
            showInput: !secretHandled,
        });
    } catch (error) {
        console.error("[Frame Deploy castHash] Error:", error);
        return renderInvalidDraftFrame({ baseUrl, postUrl, target: `${baseUrl}/create` });
    }
}
