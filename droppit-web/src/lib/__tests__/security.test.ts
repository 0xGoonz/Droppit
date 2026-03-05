import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/monitoring", () => ({
    logOperationalEvent: vi.fn(),
}));

let mockDropData: any = {};

vi.mock("viem", async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        isAddress: actual.isAddress,
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
                single: vi.fn().mockResolvedValue(mockDropData),
                maybeSingle: vi.fn().mockResolvedValue(mockDropData),
            };
            if (table === "drops") return builder;
            return builder;
        }),
    }),
}));

import { GET as DraftGET } from "@/app/api/drops/[id]/route";
import { GET as CreatorDropsGET } from "@/app/api/creator/drops/route";

// ── Tests ────────────────────────────────────────────────────────

describe("Security Tests (Item 44)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDropData = {
            data: {
                id: "drop-123",
                title: "Test",
                description: "Desc",
                edition_size: 100,
                mint_price: "0",
                image_url: null,
                token_uri: null,
                status: "DRAFT",
                contract_address: null,
                creator_address: "0x2222222222222222222222222222222222222222",
            },
            error: null,
        };
    });

    describe("Draft Read API Auth", () => {
        const createReq = (headers?: Record<string, string>) =>
            new NextRequest("http://localhost/api/drops/drop-123", {
                method: "GET",
                headers: headers || {},
            });

        it("rejects request without x-creator-address header → 401", async () => {
            const res = await DraftGET(createReq(), {
                params: Promise.resolve({ id: "drop-123" }),
            });

            expect(res.status).toBe(401);
            const json = await res.json();
            expect(json.error).toMatch(/x-creator-address/i);
        });

        it("rejects request with invalid x-creator-address → 401", async () => {
            const res = await DraftGET(
                createReq({ "x-creator-address": "not-an-address" }),
                { params: Promise.resolve({ id: "drop-123" }) }
            );

            expect(res.status).toBe(401);
        });

        it("rejects request with wrong creator address → 403", async () => {
            const res = await DraftGET(
                createReq({
                    "x-creator-address":
                        "0x3333333333333333333333333333333333333333",
                }),
                { params: Promise.resolve({ id: "drop-123" }) }
            );

            expect(res.status).toBe(403);
            const json = await res.json();
            expect(json.error).toMatch(/unauthorized|does not own/i);
        });

        it("allows request from correct creator → 200", async () => {
            const res = await DraftGET(
                createReq({
                    "x-creator-address":
                        "0x2222222222222222222222222222222222222222",
                }),
                { params: Promise.resolve({ id: "drop-123" }) }
            );

            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.title).toBe("Test");
        });
    });

    describe("Creator Drops API Auth", () => {
        const WALLET = "0x2222222222222222222222222222222222222222";

        const createReq = (wallet: string, header?: string) =>
            new NextRequest(
                `http://localhost/api/creator/drops?wallet=${wallet}`,
                {
                    method: "GET",
                    headers: header
                        ? { "x-creator-address": header }
                        : {},
                }
            );

        it("rejects request without x-creator-address → 401", async () => {
            const res = await CreatorDropsGET(createReq(WALLET));

            expect(res.status).toBe(401);
        });

        it("rejects mismatched x-creator-address vs wallet → 403", async () => {
            const res = await CreatorDropsGET(
                createReq(
                    WALLET,
                    "0x3333333333333333333333333333333333333333"
                )
            );

            expect(res.status).toBe(403);
            const json = await res.json();
            expect(json.error).toMatch(/mismatch/i);
        });

        it("allows request with matching header and wallet", async () => {
            const res = await CreatorDropsGET(createReq(WALLET, WALLET));

            expect(res.status).toBe(200);
        });
    });

    describe("Encryption Round-Trip", () => {
        it("encrypt → decrypt returns original plaintext", async () => {
            // Dynamically import so env var can be set
            process.env.LOCKED_CONTENT_ENCRYPTION_KEY = "a".repeat(64);
            const { encryptLockedContent, decryptLockedContent } = await import(
                "@/lib/crypto/lockedContent"
            );

            const plaintext = "This is my secret locked content!";
            const encrypted = encryptLockedContent(plaintext);

            expect(encrypted).toHaveProperty("iv");
            expect(encrypted).toHaveProperty("ciphertext");
            expect(encrypted).toHaveProperty("authTag");

            const decrypted = decryptLockedContent(encrypted);
            expect(decrypted).toBe(plaintext);
        });
    });
});
