import { describe, expect, it } from "vitest";

import {
    PRIVATE_DRAFT_ACCESS_MESSAGE,
    hasReusableDraftMedia,
    mapDraftLoadFailure,
    parseDraftLaunchMode,
    resolveDraftEntryBehavior,
    resolveDraftLoadStatus,
    shouldFetchDraft,
} from "@/lib/draft-load";

describe("draft-load", () => {
    it("waits for a wallet before attempting draft hydration", () => {
        expect(shouldFetchDraft({ draftId: "draft-1", address: null })).toBe(false);
        expect(resolveDraftLoadStatus({
            draftId: "draft-1",
            address: null,
            requestStatus: "idle",
        })).toBe("waiting_wallet");
    });

    it("fetches and resolves to loaded when the creator wallet is available", () => {
        expect(shouldFetchDraft({
            draftId: "draft-1",
            address: "0x2222222222222222222222222222222222222222",
        })).toBe(true);
        expect(resolveDraftLoadStatus({
            draftId: "draft-1",
            address: "0x2222222222222222222222222222222222222222",
            requestStatus: "loaded",
        })).toBe("loaded");
    });

    it("maps auth failures to the generic private-draft access message", () => {
        expect(mapDraftLoadFailure(403, "Unauthorized: wallet does not own this draft.")).toEqual({
            status: "private",
            message: PRIVATE_DRAFT_ACCESS_MESSAGE,
        });
        expect(resolveDraftLoadStatus({
            draftId: "draft-1",
            address: "0x3333333333333333333333333333333333333333",
            requestStatus: "private",
        })).toBe("private");
    });

    it("re-attempts hydration when the wallet changes from denied access to the creator wallet", () => {
        expect(shouldFetchDraft({
            draftId: "draft-1",
            address: "0x3333333333333333333333333333333333333333",
        })).toBe(true);
        expect(resolveDraftLoadStatus({
            draftId: "draft-1",
            address: "0x3333333333333333333333333333333333333333",
            requestStatus: "private",
        })).toBe("private");

        expect(shouldFetchDraft({
            draftId: "draft-1",
            address: "0x2222222222222222222222222222222222222222",
        })).toBe(true);
        expect(resolveDraftLoadStatus({
            draftId: "draft-1",
            address: "0x2222222222222222222222222222222222222222",
            requestStatus: "loading",
        })).toBe("loading");
    });

    it("treats routes without a draftId as already loaded", () => {
        expect(shouldFetchDraft({ draftId: null, address: null })).toBe(false);
        expect(resolveDraftLoadStatus({
            draftId: null,
            address: null,
            requestStatus: "idle",
        })).toBe("loaded");
    });

    it("parses supported launch modes and ignores unknown values", () => {
        expect(parseDraftLaunchMode("review")).toBe("review");
        expect(parseDraftLaunchMode("upload")).toBe("upload");
        expect(parseDraftLaunchMode("legacy")).toBeNull();
        expect(parseDraftLaunchMode(null)).toBeNull();
    });

    it("detects reusable draft media only when both token and image are present", () => {
        expect(hasReusableDraftMedia("ipfs://token", "ipfs://image")).toBe(true);
        expect(hasReusableDraftMedia("ipfs://token", null)).toBe(false);
        expect(hasReusableDraftMedia(null, "ipfs://image")).toBe(false);
    });

    it("enters review-first mode when review launch has reusable media", () => {
        expect(resolveDraftEntryBehavior({
            mode: "review",
            hasReusableMedia: true,
        })).toEqual({
            initialStep: 4,
            showMissingArtworkBanner: false,
        });
    });

    it("falls back to upload-first mode when review launch lacks reusable media", () => {
        expect(resolveDraftEntryBehavior({
            mode: "review",
            hasReusableMedia: false,
        })).toEqual({
            initialStep: 1,
            showMissingArtworkBanner: true,
        });
    });

    it("stays upload-first when upload mode is requested", () => {
        expect(resolveDraftEntryBehavior({
            mode: "upload",
            hasReusableMedia: false,
        })).toEqual({
            initialStep: 1,
            showMissingArtworkBanner: true,
        });
    });

    it("keeps legacy behavior when no AI draft mode is present", () => {
        expect(resolveDraftEntryBehavior({
            mode: null,
            hasReusableMedia: true,
        })).toEqual({
            initialStep: null,
            showMissingArtworkBanner: false,
        });
    });
});
