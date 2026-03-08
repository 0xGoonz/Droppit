import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const mockState = vi.hoisted(() => ({
    checkRateLimit: vi.fn(),
    parseDeployIntent: vi.fn(),
    createDraftRecord: vi.fn(),
    validateImageMedia: vi.fn(),
    ensureAgentPostOutboxRecord: vi.fn(),
    attemptAgentPostPublish: vi.fn(),
    webhookInsertResult: { data: { event_id: "evt-1" } as unknown, error: null as any },
}));

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: mockState.checkRateLimit,
}));

vi.mock("@/lib/intent-parser", () => ({
    parseDeployIntent: mockState.parseDeployIntent,
}));

vi.mock("@/lib/draft", () => ({
    createDraftRecord: mockState.createDraftRecord,
}));

vi.mock("@/lib/media-validation", () => ({
    validateImageMedia: mockState.validateImageMedia,
}));

vi.mock("@/lib/pinata", () => ({
    ipfsToGateway: vi.fn((uri: string) => `https://gateway.pinata.cloud/ipfs/${uri.replace("ipfs://", "")}`),
    pinata: {
        upload: {
            public: {
                file: vi.fn().mockResolvedValue({ cid: "QmImageCid" }),
                json: vi.fn().mockResolvedValue({ cid: "QmMetadataCid" }),
            },
        },
    },
}));

vi.mock("@/lib/supabase", () => ({
    getServiceRoleClient: () => ({
        from: vi.fn((table: string) => {
            if (table === "webhook_events") {
                return {
                    insert: vi.fn().mockResolvedValue(mockState.webhookInsertResult),
                };
            }
            return {
                insert: vi.fn().mockResolvedValue({ data: null, error: null }),
                update: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
        }),
    }),
}));

vi.mock("@/lib/agent-posts", async () => {
    const actual = await vi.importActual<typeof import("@/lib/agent-posts")>("@/lib/agent-posts");
    return {
        ...actual,
        ensureAgentPostOutboxRecord: mockState.ensureAgentPostOutboxRecord,
        attemptAgentPostPublish: mockState.attemptAgentPostPublish,
    };
});

import { POST } from "@/app/api/webhooks/neynar/route";

const WEBHOOK_SECRET = "test-webhook-secret-123";
const ORIGINAL_FETCH = global.fetch;

function signPayload(rawBody: string): string {
    return crypto
        .createHmac("sha512", WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");
}

function createWebhookReq(body: any): NextRequest {
    const rawBody = JSON.stringify(body);
    const sig = signPayload(rawBody);

    process.env.NEYNAR_WEBHOOK_SECRET = WEBHOOK_SECRET;

    return new NextRequest("http://localhost/api/webhooks/neynar", {
        method: "POST",
        body: rawBody,
        headers: {
            "Content-Type": "application/json",
            "x-neynar-signature": sig,
        },
    });
}

const VALID_CAST_BODY = {
    type: "cast.created",
    data: {
        hash: "0xcast123",
        author: {
            fid: 12345,
            username: "testuser",
            custody_address: "0x2222222222222222222222222222222222222222",
        },
        text: "@droppit deploy Midnight Run, 100 editions, free",
        embeds: [{ url: "https://example.com/image.png" }],
    },
};

describe("Webhook Integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.NEYNAR_WEBHOOK_SECRET = WEBHOOK_SECRET;
        process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
        process.env.NEXT_PUBLIC_GATEWAY_URL = "gateway.pinata.cloud";
        mockState.webhookInsertResult = { data: { event_id: "evt-1" }, error: null };

        mockState.checkRateLimit.mockResolvedValue(null);
        mockState.parseDeployIntent.mockResolvedValue({
            success: true,
            title: "Midnight Run",
            editionSize: 100,
            mintPrice: "0",
            assetUri: undefined,
        });
        mockState.createDraftRecord.mockResolvedValue({ success: true, id: "draft-1" });
        mockState.validateImageMedia.mockReturnValue({ ok: true, normalizedMime: "image/png" });
        mockState.ensureAgentPostOutboxRecord.mockResolvedValue({
            id: "outbox-1",
            post_type: "deploy_reply",
            source_cast_hash: "0xcast123",
            drop_id: "draft-1",
            status: "pending",
            published_cast_hash: null,
            error: null,
            request_payload: null,
            response_payload: null,
        });
        mockState.attemptAgentPostPublish.mockResolvedValue({ status: "published", castHash: "0xreplyhash" });
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: vi.fn().mockReturnValue("image/png") },
            arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
        } as unknown as Response);
    });

    afterEach(() => {
        global.fetch = ORIGINAL_FETCH;
    });

    it("creates a draft and publishes one deploy reply for a valid mention", async () => {
        const res = await POST(createWebhookReq(VALID_CAST_BODY));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(mockState.createDraftRecord).toHaveBeenCalledTimes(1);
        expect(mockState.createDraftRecord).toHaveBeenCalledWith(expect.objectContaining({
            title: "Midnight Run",
            editionSize: 100,
            mintPrice: "0",
            creationSource: "farcaster_agent",
        }));
        expect(mockState.ensureAgentPostOutboxRecord).toHaveBeenCalledTimes(1);
        expect(mockState.ensureAgentPostOutboxRecord).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            postType: "deploy_reply",
            sourceCastHash: "0xcast123",
            dropId: "draft-1",
            requestPayload: expect.objectContaining({
                parent: "0xcast123",
                embeds: [{ url: "http://localhost:3000/api/frame/deploy/0xcast123" }],
            }),
        }));
        expect(mockState.attemptAgentPostPublish).toHaveBeenCalledTimes(1);
        expect(json.success).toBe(true);
        expect(json.reply).toEqual({ status: "published", castHash: "0xreplyhash" });
    });

    it("does not create a second draft or reply for duplicate webhook events", async () => {
        mockState.webhookInsertResult = { data: null, error: { code: "23505" } };

        const res = await POST(createWebhookReq(VALID_CAST_BODY));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.message).toBe("Duplicate");
        expect(mockState.createDraftRecord).not.toHaveBeenCalled();
        expect(mockState.ensureAgentPostOutboxRecord).not.toHaveBeenCalled();
    });

    it("publishes a remediation reply and skips draft creation for invalid intents", async () => {
        mockState.parseDeployIntent.mockResolvedValue({
            success: false,
            error: "Missing field: editionSize is required.",
        });
        mockState.ensureAgentPostOutboxRecord.mockResolvedValue({
            id: "outbox-2",
            post_type: "remediation_reply",
            source_cast_hash: "0xcast123",
            drop_id: null,
            status: "pending",
            published_cast_hash: null,
            error: null,
            request_payload: null,
            response_payload: null,
        });

        const res = await POST(createWebhookReq(VALID_CAST_BODY));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(mockState.createDraftRecord).not.toHaveBeenCalled();
        expect(mockState.ensureAgentPostOutboxRecord).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            postType: "remediation_reply",
        }));
        expect(json.success).toBe(false);
        expect(json.reply.status).toBe("published");
    });

    it("keeps a text-only draft path when media validation fails", async () => {
        mockState.validateImageMedia.mockReturnValue({ ok: false, error: "Unsupported image format" });

        const res = await POST(createWebhookReq(VALID_CAST_BODY));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(mockState.createDraftRecord).toHaveBeenCalledWith(expect.objectContaining({
            imageUrl: null,
            tokenUri: null,
        }));
        expect(json.success).toBe(true);
        expect(json.frame.buttons[0].label).toBe("Missing Art: Upload High-Res");
    });

    it("normalizes ipfs source URIs before fetching media", async () => {
        mockState.parseDeployIntent.mockResolvedValue({
            success: true,
            title: "Midnight Run",
            editionSize: 100,
            mintPrice: "0",
            assetUri: "ipfs://QmHighRes123",
        });

        await POST(createWebhookReq({
            ...VALID_CAST_BODY,
            data: {
                ...VALID_CAST_BODY.data,
                embeds: [],
            },
        }));

        expect(global.fetch).toHaveBeenCalledWith("https://gateway.pinata.cloud/ipfs/QmHighRes123");
        expect(mockState.createDraftRecord).toHaveBeenCalledWith(expect.objectContaining({
            sourceAssetUri: "ipfs://QmHighRes123",
        }));
    });

    it("accepts arweave http source URIs as-is", async () => {
        mockState.parseDeployIntent.mockResolvedValue({
            success: true,
            title: "Midnight Run",
            editionSize: 100,
            mintPrice: "0",
            assetUri: "https://arweave.net/abc123",
        });

        await POST(createWebhookReq({
            ...VALID_CAST_BODY,
            data: {
                ...VALID_CAST_BODY.data,
                embeds: [],
            },
        }));

        expect(global.fetch).toHaveBeenCalledWith("https://arweave.net/abc123");
    });

    it("returns webhook success even when reply publishing fails", async () => {
        mockState.attemptAgentPostPublish.mockResolvedValue({ status: "failed", error: "provider down" });

        const res = await POST(createWebhookReq(VALID_CAST_BODY));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.reply).toEqual({ status: "failed", error: "provider down" });
        expect(mockState.createDraftRecord).toHaveBeenCalledTimes(1);
    });
});



