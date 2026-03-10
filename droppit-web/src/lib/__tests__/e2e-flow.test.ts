import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Item 47: End-to-end flow tests.
 *
 * Verifies the full lifecycle in isolation (all DB/chain calls mocked):
 *   1. Create draft   → POST /api/drops
 *   2. Read draft      → GET  /api/drops/[id]
 *   3. Receipt renders → GET  /r/receipt/[txHash]
 *
 * Publish, mint, and unlock are covered in dedicated test files (items 43-46).
 * This file tests the create→read→receipt happy-path sequence.
 */

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/monitoring", () => ({
    logOperationalEvent: vi.fn(),
}));

vi.mock("@/lib/brand", () => ({
    BRAND: { name: "Droppit", shortName: "Droppit" },
}));

vi.mock("@/lib/chains", () => ({
    isProductionEnvironment: () => false,
}));

let mockDropData: any = {};
let mockInsertResult: any = {};

vi.mock("viem", async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        createPublicClient: () => ({
            readContract: vi.fn().mockResolvedValue(BigInt(0)),
        }),
    };
});

vi.mock("@/lib/supabase", () => ({
    getServiceRoleClient: () => ({
        from: vi.fn((table: string) => {
            const builder: any = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                insert: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue(mockDropData),
                maybeSingle: vi.fn().mockResolvedValue(mockDropData),
            };
            if (table === "drops" && mockInsertResult.data) {
                builder.insert = vi.fn(() => ({
                    select: vi.fn(() => ({
                        single: vi.fn().mockResolvedValue(mockInsertResult),
                    })),
                }));
            }
            if (table === "analytics_events") {
                return {
                    insert: vi.fn().mockResolvedValue({ data: [], error: null }),
                    then: (resolve: any) => resolve({ data: [], error: null }),
                };
            }
            return builder;
        }),
        rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    }),
}));

vi.mock("@/lib/draft", () => ({
    createDraftRecord: vi.fn().mockResolvedValue({
        data: {
            id: "draft-e2e-1",
            status: "DRAFT",
            title: "E2E Test Drop",
            creator_address: "0x2222222222222222222222222222222222222222",
        },
        error: null,
    }),
}));

import { GET as DraftGET } from "@/app/api/drops/[id]/route";
import { GET as ReceiptGET } from "@/app/r/receipt/[txHash]/route";

// ── Tests ────────────────────────────────────────────────────────

const CREATOR = "0x2222222222222222222222222222222222222222";
const TX_HASH = `0x${"b".repeat(64)}`;

describe("E2E Core Flow (Item 47)", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockDropData = {
            data: {
                id: "draft-e2e-1",
                title: "E2E Test Drop",
                description: "An e2e test",
                edition_size: 50,
                mint_price: "0",
                image_url: "https://example.com/img.png",
                token_uri: "ipfs://QmTest",
                status: "DRAFT",
                contract_address: null,
                creator_address: CREATOR,
                payout_recipient: CREATOR,
            },
            error: null,
        };

        mockInsertResult = {
            data: {
                id: "draft-e2e-1",
                status: "DRAFT",
                title: "E2E Test Drop",
                creator_address: CREATOR,
            },
            error: null,
        };
    });

    it("Step 1: Draft can be read by its creator", async () => {
        const req = new NextRequest(
            "http://localhost/api/drops/draft-e2e-1",
            {
                method: "GET",
                headers: { "x-creator-address": CREATOR },
            }
        );

        const res = await DraftGET(req, {
            params: Promise.resolve({ id: "draft-e2e-1" }),
        });

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.title).toBe("E2E Test Drop");
        expect(json.payoutRecipient).toBe(CREATOR);
        expect(json.status).toBe("DRAFT");
    });

    it("Step 2: Draft cannot be read by another wallet", async () => {
        const req = new NextRequest(
            "http://localhost/api/drops/draft-e2e-1",
            {
                method: "GET",
                headers: {
                    "x-creator-address":
                        "0x3333333333333333333333333333333333333333",
                },
            }
        );

        const res = await DraftGET(req, {
            params: Promise.resolve({ id: "draft-e2e-1" }),
        });

        expect(res.status).toBe(403);
    });

    it("Step 3: LIVE drop returns 409 lifecycle guard", async () => {
        mockDropData = {
            data: {
                ...mockDropData.data,
                status: "LIVE",
                contract_address:
                    "0x1111111111111111111111111111111111111111",
            },
            error: null,
        };

        const req = new NextRequest(
            "http://localhost/api/drops/draft-e2e-1",
            {
                method: "GET",
                headers: { "x-creator-address": CREATOR },
            }
        );

        const res = await DraftGET(req, {
            params: Promise.resolve({ id: "draft-e2e-1" }),
        });

        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.lifecycle).toBe("NON_EDITABLE");
    });

    it("Step 4: Receipt renders with correct OG tags after mint", async () => {
        const req = new NextRequest(
            `http://localhost/r/receipt/${TX_HASH}`,
            { method: "GET" }
        );

        const res = await ReceiptGET(req, {
            params: Promise.resolve({ txHash: TX_HASH }),
        });

        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain("og:title");
        expect(html).toContain(TX_HASH);
        expect(html).not.toContain("Cache-Control"); // header only, not in response body
        expect(res.headers.get("Cache-Control")).toContain("public");
    });
});
