import type { DraftLaunchMode } from "@/lib/draft-load";

export interface DraftShareSpec {
    reviewUrl: string;
    ogImageUrl: string;
    shareImageUrl: string;
    shareUrl: string;
    launchUrl: string;
    buttonTitle: string;
    mode: DraftLaunchMode | null;
}

export function getDraftShareSpec(
    baseUrl: string,
    draftId: string,
    options: { hasReusableMedia?: boolean | null } = {}
): DraftShareSpec {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const encodedDraftId = encodeURIComponent(draftId);
    const mode = typeof options.hasReusableMedia === "boolean"
        ? (options.hasReusableMedia ? "review" : "upload")
        : null;
    const reviewUrl = `${normalizedBaseUrl}/create?draftId=${encodedDraftId}${mode ? `&mode=${mode}` : ""}`;
    const ogImageUrl = `${normalizedBaseUrl}/api/og/draft/${encodedDraftId}`;
    const shareImageUrl = `${ogImageUrl}?variant=miniapp`;
    const shareUrl = `${normalizedBaseUrl}/s/draft/${encodedDraftId}`;
    const buttonTitle = mode === "review"
        ? "Review & Deploy"
        : mode === "upload"
            ? "Upload High-Res"
            : "Review Draft";

    return {
        reviewUrl,
        ogImageUrl,
        shareImageUrl,
        shareUrl,
        launchUrl: reviewUrl,
        buttonTitle,
        mode,
    };
}
