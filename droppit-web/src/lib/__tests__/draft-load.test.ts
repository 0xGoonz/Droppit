import { describe, expect, it } from "vitest";

import {
    PRIVATE_DRAFT_ACCESS_MESSAGE,
    mapDraftLoadFailure,
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
});