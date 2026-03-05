import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/monitoring", () => ({
    logOperationalEvent: vi.fn(),
}));

let mockWebhookEventsData: any = { data: null, error: null };
let mockInsertedData: any = { data: { id: "new-draft" }, error: null };

vi.mock("@/lib/pinata", () => ({
    pinata: {
        upload: {
            json: vi.fn().mockReturnValue({
                key: vi.fn().mockReturnValue({
                    group: vi.fn().mockResolvedValue({
                        IpfsHash: "QmTestHash123",
                    }),
                }),
            }),
        },
        gateways: {
            convert: vi.fn().mockResolvedValue("https://gateway.pinata.cloud/ipfs/QmTestHash123"),
        },
    },
}));

vi.mock("@/lib/media-validation", () => ({
    validateImageMedia: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock("@/lib/draft", () => ({
    createDraftRecord: vi.fn().mockResolvedValue({ data: { id: "new-draft" }, error: null }),
}));

vi.mock("@/lib/supabase", () => ({
    getServiceRoleClient: () => ({
        from: vi.fn((table: string) => {
            const builder: any = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                insert: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue(mockWebhookEventsData),
                maybeSingle: vi.fn().mockResolvedValue(mockWebhookEventsData),
            };
            if (table === "webhook_events") {
                return {
                    ...builder,
                    insert: vi.fn().mockResolvedValue(mockInsertedData),
                };
            }
            return builder;
        }),
    }),
}));

import { POST } from "@/app/api/webhooks/neynar/route";

// ── Helpers ──────────────────────────────────────────────────────

const WEBHOOK_SECRET = "test-webhook-secret-123";

function signPayload(rawBody: string): string {
    return crypto
        .createHmac("sha512", WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");
}

function createWebhookReq(body: any): NextRequest {
    const rawBody = JSON.stringify(body);
    const sig = signPayload(rawBody);

    // We need to set env before route runs
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
        text: "/drop title: My Drop, price: 0, supply: 100",
        embeds: [{ url: "https://example.com/image.png" }],
    },
};

describe("Webhook Integration (Item 43)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.NEYNAR_WEBHOOK_SECRET = WEBHOOK_SECRET;
        process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
        mockWebhookEventsData = { data: null, error: null };
        mockInsertedData = { data: { id: "new-draft" }, error: null };
    });

    it("rejects request without valid signature → 401", async () => {
        const req = new NextRequest("http://localhost/api/webhooks/neynar", {
            method: "POST",
            body: JSON.stringify(VALID_CAST_BODY),
            headers: {
                "Content-Type": "application/json",
                "x-neynar-signature": "invalid-signature",
            },
        });

        const res = await POST(req);

        expect(res.status).toBe(401);
    });

    it("returns 200 for unsupported event types without processing", async () => {
        const body = { ...VALID_CAST_BODY, type: "cast.deleted" };
        const req = createWebhookReq(body);

        const res = await POST(req);

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.message).toMatch(/not supported/i);
    });

    it("returns 200 for idempotent duplicate cast.created", async () => {
        // Simulate webhook_events already has this castHash:eventType
        mockWebhookEventsData = {
            data: { id: "existing-event", cast_hash: "0xcast123" },
            error: null,
        };

        const req = createWebhookReq(VALID_CAST_BODY);
        const res = await POST(req);

        expect(res.status).toBe(200);
    });
});
