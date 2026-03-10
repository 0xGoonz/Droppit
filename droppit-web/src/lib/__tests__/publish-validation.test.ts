import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/drops/[id]/publish/route";
import { keccak256, toBytes } from "viem";

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/monitoring", () => ({
    logOperationalEvent: vi.fn(),
}));

let mockDraftData: any = {};
let mockConflictData: any = {};
let mockUpdateResult: any = {};
let lastUpdatePayload: any = null;

vi.mock("@/lib/supabase", () => ({
    getServiceRoleClient: () => ({
        from: vi.fn(() => {
            const builder: any = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn(function (this: any) {
                    return this;
                }),
                neq: vi.fn().mockReturnThis(),
                update: vi.fn((payload: any) => {
                    lastUpdatePayload = payload;
                    return {
                        eq: vi.fn().mockReturnThis(),
                        select: vi.fn().mockResolvedValue(mockUpdateResult),
                    };
                }),
                single: vi.fn().mockImplementation(() => Promise.resolve(mockDraftData)),
                maybeSingle: vi.fn().mockImplementation(() => Promise.resolve(mockConflictData)),
            };
            return builder;
        }),
    }),
}));

const mockGetTransactionReceipt = vi.fn();
const mockDecodeEventLog = vi.fn();

vi.mock("viem", async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        createPublicClient: () => ({
            getTransactionReceipt: (...args: any[]) => mockGetTransactionReceipt(...args),
        }),
        decodeEventLog: (...args: any[]) => mockDecodeEventLog(...args),
    };
});

vi.mock("viem/chains", () => ({
    base: { id: 8453, name: "Base" },
    baseSepolia: { id: 84532, name: "Base Sepolia" },
}));

vi.mock("@/lib/contracts", () => ({
    getChainContracts: () => ({
        factoryAddress: "0x3333333333333333333333333333333333333333",
        implementationAddress: "0x4444444444444444444444444444444444444444",
    }),
}));

const VALID_TX_HASH = `0x${"a".repeat(64)}`;
const VALID_ADDRESS = "0x1111111111111111111111111111111111111111";
const CREATOR = "0x2222222222222222222222222222222222222222";
const OTHER_CREATOR = "0x6666666666666666666666666666666666666666";
const FACTORY_ADDRESS = "0x3333333333333333333333333333333333333333";
const PROTOCOL_FEE_RECIPIENT = "0x7777777777777777777777777777777777777777";
const DROP_CREATED_EVENT_TOPIC0 = keccak256(
    toBytes("DropCreated(address,address,uint256,uint256,address,address,uint256,string)")
);

function createReq(body: any) {
    return new NextRequest("http://localhost/api/drops/drop-123/publish", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

const baseBody = {
    txHash: VALID_TX_HASH,
    contractAddress: VALID_ADDRESS,
    tokenUri: "ipfs://test",
    imageUrl: "https://example.com/image.png",
};

describe("Publish Route Validation (Item 45)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        lastUpdatePayload = null;

        mockDraftData = {
            data: {
                id: "drop-123",
                status: "DRAFT",
                locked_content_draft: null,
                creator_address: CREATOR,
                edition_size: 100,
                mint_price: "0",
                payout_recipient: CREATOR,
                token_uri: "ipfs://test",
                tx_hash_deploy: null,
            },
            error: null,
        };

        mockConflictData = { data: null, error: null };

        mockUpdateResult = {
            data: [{ id: "drop-123", status: "LIVE" }],
            error: null,
        };

        mockGetTransactionReceipt.mockResolvedValue({
            status: "success",
            logs: [
                {
                    address: FACTORY_ADDRESS,
                    topics: [DROP_CREATED_EVENT_TOPIC0, "0x", "0x"],
                    data: "0x",
                },
            ],
        });

        mockDecodeEventLog.mockReturnValue({
            args: {
                creator: CREATOR,
                drop: VALID_ADDRESS,
                editionSize: BigInt(100),
                mintPrice: BigInt(0),
                payoutRecipient: CREATOR,
                protocolFeeRecipient: PROTOCOL_FEE_RECIPIENT,
                protocolFeePerMint: BigInt(0),
                tokenUri: "ipfs://test",
            },
        });
    });

    it("rejects missing txHash -> 400", async () => {
        const body = { ...baseBody, txHash: undefined };
        const res = await POST(createReq(body), {
            params: Promise.resolve({ id: "drop-123" }),
        });

        expect(res.status).toBe(400);
    });

    it("rejects invalid contract address -> 400", async () => {
        const body = { ...baseBody, contractAddress: "not-an-address" };
        const res = await POST(createReq(body), {
            params: Promise.resolve({ id: "drop-123" }),
        });

        expect(res.status).toBe(400);
    });

    it("rejects when draft is already LIVE -> 409", async () => {
        mockDraftData = { data: null, error: { code: "PGRST116" } };

        const res = await POST(createReq(baseBody), {
            params: Promise.resolve({ id: "drop-123" }),
        });

        expect([404, 409]).toContain(res.status);
    });

    it("rejects when txHash already used by another drop -> 409", async () => {
        mockConflictData = {
            data: { id: "other-drop-456" },
            error: null,
        };

        const res = await POST(createReq(baseBody), {
            params: Promise.resolve({ id: "drop-123" }),
        });

        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.error).toMatch(/already been used/i);
    });

    it("publishes null-creator drafts when creatorWallet matches the onchain creator", async () => {
        mockDraftData = {
            data: {
                ...mockDraftData.data,
                creator_address: null,
                payout_recipient: null,
            },
            error: null,
        };

        const res = await POST(createReq({
            ...baseBody,
            creatorWallet: CREATOR,
        }), {
            params: Promise.resolve({ id: "drop-123" }),
        });

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(lastUpdatePayload).toMatchObject({
            status: "LIVE",
            tx_hash_deploy: VALID_TX_HASH,
            contract_address: VALID_ADDRESS,
            creator_address: CREATOR,
        });
    });

    it("publishes null-creator drafts with the legacy farcasterWallet field", async () => {
        mockDraftData = {
            data: {
                ...mockDraftData.data,
                creator_address: null,
                payout_recipient: null,
            },
            error: null,
        };

        const res = await POST(createReq({
            ...baseBody,
            farcasterWallet: CREATOR,
        }), {
            params: Promise.resolve({ id: "drop-123" }),
        });

        expect(res.status).toBe(200);
        expect(lastUpdatePayload).toMatchObject({
            creator_address: CREATOR,
        });
    });

    it("rejects null-creator drafts when the submitted wallet does not match the onchain creator", async () => {
        mockDraftData = {
            data: {
                ...mockDraftData.data,
                creator_address: null,
                payout_recipient: null,
            },
            error: null,
        };

        const res = await POST(createReq({
            ...baseBody,
            creatorWallet: OTHER_CREATOR,
        }), {
            params: Promise.resolve({ id: "drop-123" }),
        });

        expect(res.status).toBe(422);
        const json = await res.json();
        expect(json.error).toMatch(/creator does not match/i);
        expect(lastUpdatePayload).toBeNull();
    });

    it("still publishes normal web drafts without requiring creatorWallet", async () => {
        const res = await POST(createReq(baseBody), {
            params: Promise.resolve({ id: "drop-123" }),
        });

        expect(res.status).toBe(200);
        expect(lastUpdatePayload?.creator_address).toBeUndefined();
    });
});