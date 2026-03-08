export interface DraftShareSpec {
    reviewUrl: string;
    ogImageUrl: string;
    shareImageUrl: string;
    shareUrl: string;
    launchUrl: string;
    buttonTitle: string;
}

export function getDraftShareSpec(baseUrl: string, draftId: string): DraftShareSpec {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const encodedDraftId = encodeURIComponent(draftId);
    const reviewUrl = `${normalizedBaseUrl}/create?draftId=${encodedDraftId}`;
    const ogImageUrl = `${normalizedBaseUrl}/api/og/draft/${encodedDraftId}`;
    const shareUrl = `${normalizedBaseUrl}/s/draft/${encodedDraftId}`;

    return {
        reviewUrl,
        ogImageUrl,
        shareImageUrl: ogImageUrl,
        shareUrl,
        launchUrl: reviewUrl,
        buttonTitle: "Review Draft",
    };
}
