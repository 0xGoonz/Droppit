import { NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import type { DeployDraft } from "@/lib/frame-deploy";
import {
    DEPLOY_DRAFT_SELECT,
    finalizeDeployFromFrameCallback,
    renderDraftPreviewFrame,
    renderInvalidDraftFrame,
    renderLiveDropFrame,
    stageDraftSecretFromFrameInput,
} from "@/lib/frame-deploy-frame";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ draftId: string }> }
) {
    const resolvedParams = await params;
    const draftId = resolvedParams.draftId;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://droppit.ai";

    const createUrl = `${baseUrl}/create?draftId=${draftId}`;
    const ogImageUrl = `${baseUrl}/api/og/draft/${draftId}`;
    const postUrl = `${baseUrl}/api/frame/draft/${draftId}/deploy`;
    const txUrl = `${baseUrl}/api/frame/draft/${draftId}/deploy/tx`;

    try {
        const supabaseAdmin = getServiceRoleClient();
        const { data: draft, error } = await supabaseAdmin
            .from("drops")
            .select(DEPLOY_DRAFT_SELECT)
            .eq("id", draftId)
            .maybeSingle();

        if (error || !draft) {
            return renderInvalidDraftFrame({ baseUrl, postUrl });
        }

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

        const secretHandled = body ? await stageDraftSecretFromFrameInput(draftId, body) : false;

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
        console.error("[Frame Draft Deploy] Error:", error);
        return renderInvalidDraftFrame({ baseUrl, postUrl, target: `${baseUrl}/create` });
    }
}
