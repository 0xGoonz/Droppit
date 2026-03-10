export const PRIVATE_DRAFT_ACCESS_MESSAGE =
    "This draft is private. Connect the creator wallet used to create it to continue.";

export type DraftLaunchMode = "review" | "upload";

export type DraftLoadRequestStatus =
    | "idle"
    | "loading"
    | "loaded"
    | "private"
    | "error";

export type DraftLoadStatus =
    | "idle"
    | "waiting_wallet"
    | "loading"
    | "loaded"
    | "private"
    | "error";

export function parseDraftLaunchMode(rawMode: string | null | undefined): DraftLaunchMode | null {
    if (rawMode === "review" || rawMode === "upload") {
        return rawMode;
    }

    return null;
}

export function hasReusableDraftMedia(
    tokenUri: string | null | undefined,
    imageUrl: string | null | undefined
): boolean {
    return Boolean(tokenUri && imageUrl);
}

export function resolveDraftEntryBehavior(params: {
    mode: DraftLaunchMode | null;
    hasReusableMedia: boolean;
}): {
    initialStep: 1 | 4 | null;
    showMissingArtworkBanner: boolean;
} {
    if (params.mode === "review" && params.hasReusableMedia) {
        return {
            initialStep: 4,
            showMissingArtworkBanner: false,
        };
    }

    if (params.mode === "review" || params.mode === "upload") {
        return {
            initialStep: 1,
            showMissingArtworkBanner: !params.hasReusableMedia,
        };
    }

    return {
        initialStep: null,
        showMissingArtworkBanner: false,
    };
}

export function shouldFetchDraft(params: {
    draftId: string | null;
    address: string | null | undefined;
}): boolean {
    return Boolean(params.draftId && params.address);
}

export function resolveDraftLoadStatus(params: {
    draftId: string | null;
    address: string | null | undefined;
    requestStatus: DraftLoadRequestStatus;
}): DraftLoadStatus {
    if (!params.draftId) return "loaded";
    if (!params.address) return "waiting_wallet";
    if (params.requestStatus === "idle") return "loading";
    return params.requestStatus;
}

export function mapDraftLoadFailure(
    status: number,
    fallbackMessage?: string | null
): { status: "private" | "error"; message: string } {
    if (status === 401 || status === 403) {
        return {
            status: "private",
            message: PRIVATE_DRAFT_ACCESS_MESSAGE,
        };
    }

    return {
        status: "error",
        message: fallbackMessage?.trim() || "Failed to load draft data.",
    };
}