import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockState = vi.hoisted(() => ({
    renderDeployFramePage: vi.fn(),
    finalizeDeployFromFrameCallback: vi.fn(),
    renderDraftPreviewFrame: vi.fn(),
    renderInvalidDraftFrame: vi.fn(),
    renderLiveDropFrame: vi.fn(),
    stageDraftSecretFromFrameInput: vi.fn(),
    draftRecord: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/frame-deploy-page", () => ({
    renderDeployFramePage: mockState.renderDeployFramePage,
}));

vi.mock("@/lib/frame-deploy-frame", () => ({
    DEPLOY_DRAFT_SELECT: "id, status",
    finalizeDeployFromFrameCallback: mockState.finalizeDeployFromFrameCallback,
    renderDraftPreviewFrame: mockState.renderDraftPreviewFrame,
    renderInvalidDraftFrame: mockState.renderInvalidDraftFrame,
    renderLiveDropFrame: mockState.renderLiveDropFrame,
    stageDraftSecretFromFrameInput: mockState.stageDraftSecretFromFrameInput,
}));

vi.mock("@/lib/supabase", () => ({
    getServiceRoleClient: () => ({
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockImplementation(async () => ({ data: mockState.draftRecord, error: null })),
            insert: vi.fn().mockResolvedValue({ error: null }),
        })),
    }),
}));

import { GET, POST } from "@/app/api/frame/deploy/[castHash]/route";

describe("frame deploy castHash route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
        mockState.draftRecord = {
            id: "draft-1",
            status: "DRAFT",
            contract_address: null,
            creator_address: "0x1111111111111111111111111111111111111111",
        };
        mockState.renderDeployFramePage.mockResolvedValue(new Response("get-frame", { headers: { "content-type": "text/html" } }));
        mockState.finalizeDeployFromFrameCallback.mockResolvedValue(new Response("finalized", { headers: { "content-type": "text/html" } }));
        mockState.renderDraftPreviewFrame.mockReturnValue(new Response("preview", { headers: { "content-type": "text/html" } }));
        mockState.renderInvalidDraftFrame.mockReturnValue(new Response("invalid", { headers: { "content-type": "text/html" } }));
        mockState.renderLiveDropFrame.mockReturnValue(new Response("live", { headers: { "content-type": "text/html" } }));
        mockState.stageDraftSecretFromFrameInput.mockResolvedValue(false);
    });

    it("renders the deploy frame on GET for embeddable reply URLs", async () => {
        const req = new NextRequest("http://localhost/api/frame/deploy/0xcast123");
        const res = await GET(req, { params: Promise.resolve({ castHash: "0xcast123" }) });

        expect(mockState.renderDeployFramePage).toHaveBeenCalledWith({
            castHash: "0xcast123",
            baseUrl: "http://localhost:3000",
        });
        expect(await res.text()).toBe("get-frame");
    });

    it("still finalizes deploy callbacks on POST", async () => {
        const req = new NextRequest("http://localhost/api/frame/deploy/0xcast123", {
            method: "POST",
            body: JSON.stringify({ trustedData: { messageBytes: "0xabc" } }),
            headers: { "content-type": "application/json" },
        });

        const res = await POST(req, { params: Promise.resolve({ castHash: "0xcast123" }) });

        expect(mockState.finalizeDeployFromFrameCallback).toHaveBeenCalledTimes(1);
        expect(await res.text()).toBe("finalized");
    });
});
