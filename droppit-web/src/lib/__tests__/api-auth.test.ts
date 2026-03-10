import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as StatsPOST } from "@/app/api/stats/[contractAddress]/route";
import { POST as UnlockPOST } from "@/app/api/drop/locked/route";

// Mock dependencies
vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn().mockResolvedValue(null)
}));

const mockVerifyMessage = vi.fn().mockResolvedValue(true);
const mockReadContract = vi.fn().mockResolvedValue(BigInt(0));

vi.mock("viem", async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        verifyMessage: (...args: any[]) => mockVerifyMessage(...args),
        createPublicClient: () => ({
            readContract: (...args: any[]) => mockReadContract(...args)
        })
    };
});

let mockDropData: any = {};
let mockNonceData: any = {};
let mockBurnData: any = {};
let mockConsumeNonceOnce = vi.fn();

vi.mock("@/lib/nonce-consume", () => ({
    consumeNonceOnce: (...args: any[]) => mockConsumeNonceOnce(...args)
}));

vi.mock("@/lib/supabase", () => ({
    getServiceRoleClient: () => {
        const createBuilder = (tableData: any) => {
            const builder: any = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                not: vi.fn().mockReturnThis(),
                gt: vi.fn().mockReturnThis(),
                update: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue(tableData),
                maybeSingle: vi.fn().mockResolvedValue(tableData)
            };
            // For analytics promises
            builder.then = (resolve: any) => resolve(tableData);
            return builder;
        };

        return {
            from: vi.fn((table: string) => {
                if (table === "drops") return createBuilder(mockDropData);
                if (table === "nonces") {
                    // Quick hack to separate the read vs update for nonces
                    const builder: any = {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        not: vi.fn().mockReturnThis(),
                        gt: vi.fn().mockReturnThis(),
                        update: vi.fn(() => createBuilder(mockBurnData)),
                        single: vi.fn().mockResolvedValue(mockNonceData),
                        maybeSingle: vi.fn().mockResolvedValue(mockNonceData) // for nonce read
                    };
                    return builder;
                }
                if (table === "analytics_events") return createBuilder({ data: [], count: 0, error: null });
                return createBuilder({ data: null, error: null });
            })
        };
    }
}));

describe("API Auth API-level Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockVerifyMessage.mockResolvedValue(true);
        mockConsumeNonceOnce.mockResolvedValue({ id: "nonce-1" });

        mockDropData = {
            data: {
                id: "drop-123",
                contract_address: "0x1111111111111111111111111111111111111111",
                creator_address: "0x2222222222222222222222222222222222222222",
                status: "LIVE",
                edition_size: 100,
                mint_price: "0",
                locked_content: "plainsecret"
            },
            error: null
        };

        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);

        mockNonceData = {
            data: {
                id: "nonce-1",
                nonce: "Action: stats_read\nWallet: 0x2222222222222222222222222222222222222222\nContract: 0x1111111111111111111111111111111111111111\nChain ID: 84532",
                wallet: "0x2222222222222222222222222222222222222222",
                action: "stats_read",
                chain_id: "84532",
                drop_id: "drop-123",
                drop_contract: "0x1111111111111111111111111111111111111111",
                used: false,
                expires_at: futureDate.toISOString()
            },
            error: null
        };

        mockBurnData = {
            data: { id: "nonce-1" },
            error: null
        };

        mockReadContract.mockResolvedValue(BigInt(1)); // Has balance
    });

    describe("Stats Auth Routes", () => {
        const createStatsReq = (body: any) => new NextRequest("http://localhost/api/stats/0x1111111111111111111111111111111111111111", {
            method: "POST",
            body: JSON.stringify(body)
        });

        it("first use succeeds", async () => {
            const res = await StatsPOST(createStatsReq({
                wallet: "0x2222222222222222222222222222222222222222",
                signature: "0xsig",
                nonce: "Action: stats_read\nWallet: 0x2222222222222222222222222222222222222222\nContract: 0x1111111111111111111111111111111111111111\nChain ID: 84532"
            }), { params: Promise.resolve({ contractAddress: "0x1111111111111111111111111111111111111111" }) });

            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.drop.id).toBe("drop-123");
        });

        it("second use fails (already consumed)", async () => {
            mockNonceData.data.used = true; // DB says already used
            const res = await StatsPOST(createStatsReq({
                wallet: "0x2222222222222222222222222222222222222222",
                signature: "0xsig",
                nonce: "Action: stats_read\nWallet: 0x2222222222222222222222222222222222222222\nContract: 0x1111111111111111111111111111111111111111\nChain ID: 84532"
            }), { params: Promise.resolve({ contractAddress: "0x1111111111111111111111111111111111111111" }) });

            expect(res.status).toBe(403);
            const json = await res.json();
            expect(json.error).toMatch(/consumed/);
        });

        it("expired nonce fails", async () => {
            const pastDate = new Date();
            pastDate.setFullYear(pastDate.getFullYear() - 1);
            mockNonceData.data.expires_at = pastDate.toISOString();

            const res = await StatsPOST(createStatsReq({
                wallet: "0x2222222222222222222222222222222222222222",
                signature: "0xsig",
                nonce: "Action: stats_read\nWallet: 0x2222222222222222222222222222222222222222\nContract: 0x1111111111111111111111111111111111111111\nChain ID: 84532"
            }), { params: Promise.resolve({ contractAddress: "0x1111111111111111111111111111111111111111" }) });

            expect(res.status).toBe(403);
            const json = await res.json();
            expect(json.error).toMatch(/expired/);
        });

        it("wrong wallet binding fails", async () => {
            // Drop creator is 0x2222222222222222222222222222222222222222. Requester provides 0x3333333333333333333333333333333333333333.
            const res = await StatsPOST(createStatsReq({
                wallet: "0x3333333333333333333333333333333333333333",
                signature: "0xsig",
                nonce: "Action: stats_read\nWallet: 0x2222222222222222222222222222222222222222\nContract: 0x1111111111111111111111111111111111111111\nChain ID: 84532"
            }), { params: Promise.resolve({ contractAddress: "0x1111111111111111111111111111111111111111" }) });

            expect(res.status).toBe(403);
            const json = await res.json();
            expect(json.error).toMatch(/different wallet|Not the drop creator/);
        });

        it("wrong chain binding fails", async () => {
            mockNonceData.data.chain_id = "1"; // DB nonce requires chain_id 1
            const res = await StatsPOST(createStatsReq({
                wallet: "0x2222222222222222222222222222222222222222",
                signature: "0xsig",
                nonce: "Action: stats_read\nWallet: 0x2222222222222222222222222222222222222222\nContract: 0x1111111111111111111111111111111111111111\nChain ID: 84532"
            }), { params: Promise.resolve({ contractAddress: "0x1111111111111111111111111111111111111111" }) });

            expect(res.status).toBe(403);
            const json = await res.json();
            expect(json.error).toMatch(/chain does not match/);
        });

        it("fails if payload message tampered", async () => {
            // nonce DB matches, but the user sends a tampered nonce string missing required parts
            const res = await StatsPOST(createStatsReq({
                wallet: "0x2222222222222222222222222222222222222222",
                signature: "0xsig",
                nonce: "Action: stats_read\nWallet: 0x2222222222222222222222222222222222222222\nContract: 0x5555555555555555555555555555555555555555\nChain ID: 84532"
            }), { params: Promise.resolve({ contractAddress: "0x1111111111111111111111111111111111111111" }) });

            expect(res.status).toBe(403);
            const json = await res.json();
            expect(json.error).toMatch(/payload content tampered/i);
        });
    });

    describe("Unlock Auth Routes", () => {
        const createUnlockReq = (body: any) => new NextRequest("http://localhost/api/drop/locked", {
            method: "POST",
            body: JSON.stringify(body)
        });

        beforeEach(() => {
            mockNonceData.data.action = "unlock";
        });

        it("first use succeeds", async () => {
            const res = await UnlockPOST(createUnlockReq({
                tokenUri: "ipfs://...",
                userAddress: "0x2222222222222222222222222222222222222222",
                contractAddress: "0x1111111111111111111111111111111111111111",
                signature: "0xsig",
                nonce: "nonce-1"
            }));

            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.lockedContent).toBe("plainsecret");
        });

        it("second use fails (already consumed)", async () => {
            mockConsumeNonceOnce.mockResolvedValue(null);

            const res = await UnlockPOST(createUnlockReq({
                tokenUri: "ipfs://...",
                userAddress: "0x2222222222222222222222222222222222222222",
                contractAddress: "0x1111111111111111111111111111111111111111",
                signature: "0xsig",
                nonce: "nonce-1"
            }));

            expect(res.status).toBe(403);
            const json = await res.json();
            expect(json.error).toMatch(/consumed/);
        });

        it("expired nonce fails", async () => {
            const pastDate = new Date();
            pastDate.setFullYear(pastDate.getFullYear() - 1);
            mockNonceData.data.expires_at = pastDate.toISOString();

            const res = await UnlockPOST(createUnlockReq({
                tokenUri: "ipfs://...",
                userAddress: "0x2222222222222222222222222222222222222222",
                contractAddress: "0x1111111111111111111111111111111111111111",
                signature: "0xsig",
                nonce: "nonce-1"
            }));

            expect(res.status).toBe(403);
            const json = await res.json();
            expect(json.error).toMatch(/expired/);
        });

        it("wrong wallet binding fails", async () => {
            const res = await UnlockPOST(createUnlockReq({
                tokenUri: "ipfs://...",
                userAddress: "0x3333333333333333333333333333333333333333", // requester
                contractAddress: "0x1111111111111111111111111111111111111111",
                signature: "0xsig",
                nonce: "nonce-1"
            }));

            expect(res.status).toBe(403);
            const json = await res.json();
            expect(json.error).toMatch(/different wallet/);
        });

        it("wrong drop binding fails", async () => {
            const res = await UnlockPOST(createUnlockReq({
                tokenUri: "ipfs://...",
                userAddress: "0x2222222222222222222222222222222222222222",
                contractAddress: "0x4444444444444444444444444444444444444444", // wrong contract
                signature: "0xsig",
                nonce: "nonce-1"
            }));

            expect(res.status).toBe(403);
            const json = await res.json();
            expect(json.error).toMatch(/different drop contract/i);
        });
    });
});
