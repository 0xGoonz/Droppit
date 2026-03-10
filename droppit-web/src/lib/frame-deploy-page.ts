import { getServiceRoleClient } from "@/lib/supabase";
import type { DeployDraft } from "@/lib/frame-deploy";
import {
    DEPLOY_DRAFT_SELECT,
    renderDraftPreviewFrame,
    renderInvalidDraftFrame,
    renderLiveDropFrame,
} from "@/lib/frame-deploy-frame";

export async function renderDeployFramePage(params: {
    castHash: string;
    baseUrl: string;
}) {
    const { castHash, baseUrl } = params;
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

        const typedDraft = draft as DeployDraft;
        const draftId = typedDraft.id;
        const createUrl = `${baseUrl}/create?draftId=${draftId}`;
        const ogImageUrl = `${baseUrl}/api/og/draft/${draftId}`;
        const txUrl = `${baseUrl}/api/frame/deploy/${castHash}/tx`;

        if (typedDraft.status === "LIVE") {
            return renderLiveDropFrame({
                baseUrl,
                postUrl,
                draftId,
                contractAddress: typedDraft.contract_address,
                imageSrc: ogImageUrl,
            });
        }

        if (typedDraft.status !== "DRAFT") {
            return renderInvalidDraftFrame({
                baseUrl,
                postUrl,
                target: createUrl,
                imageSrc: ogImageUrl,
            });
        }

        return renderDraftPreviewFrame({
            baseUrl,
            postUrl,
            draftId,
            txTarget: txUrl,
            createUrl,
            ogImageUrl,
            showInput: true,
        });
    } catch (error) {
        console.error("[Frame Deploy castHash GET] Error:", error);
        return renderInvalidDraftFrame({ baseUrl, postUrl, target: `${baseUrl}/create` });
    }
}
