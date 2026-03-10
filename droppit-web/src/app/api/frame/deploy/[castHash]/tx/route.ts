import { NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import type { DeployDraft } from "@/lib/frame-deploy";
import {
    buildDeployTxFrameResponse,
    DEPLOY_DRAFT_SELECT,
    renderInvalidDraftFrame,
    renderLiveDropFrame,
    stageDraftSecretFromFrameInput,
} from "@/lib/frame-deploy-frame";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ castHash: string }> }
) {
    const resolvedParams = await params;
    const castHash = resolvedParams.castHash;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://droppitonbase.xyz";
    const postUrl = `${baseUrl}/api/frame/deploy/${castHash}`;

    try {
        const body = await req.json().catch(() => null);
        const supabaseAdmin = getServiceRoleClient();
        const { data: draft, error } = await supabaseAdmin
            .from("drops")
            .select(DEPLOY_DRAFT_SELECT)
            .eq("cast_hash", castHash)
            .maybeSingle();

        if (error || !draft) {
            return renderInvalidDraftFrame({ baseUrl, postUrl, target: `${baseUrl}/create` });
        }

        const draftId = draft.id;
        const createUrl = `${baseUrl}/create?draftId=${draftId}`;
        const ogImageUrl = `${baseUrl}/api/og/draft/${draftId}`;

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
            return renderInvalidDraftFrame({ baseUrl, postUrl, target: createUrl, imageSrc: ogImageUrl });
        }

        if (!body) {
            return renderInvalidDraftFrame({ baseUrl, postUrl, target: createUrl, imageSrc: ogImageUrl });
        }

        await stageDraftSecretFromFrameInput(draftId, draft.creator_address || "", body);

        return buildDeployTxFrameResponse({
            baseUrl,
            postUrl,
            fallbackTarget: createUrl,
            fallbackImageSrc: ogImageUrl,
            draft: draft as DeployDraft,
            body,
        });
    } catch (error) {
        console.error("[Frame Deploy castHash TX] Error:", error);
        return renderInvalidDraftFrame({ baseUrl, postUrl, target: `${baseUrl}/create` });
    }
}
