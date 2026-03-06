import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockImageResponse = vi.fn((element: unknown, init?: ResponseInit) => new Response("image", {
    status: 200,
    headers: init?.headers,
}));
const mockReadContract = vi.fn();
const mockDropMaybeSingle = vi.fn();
const mockIdentityMaybeSingle = vi.fn();
const mockFetch = vi.fn();

global.fetch = mockFetch as typeof fetch;

vi.mock("next/og", () => ({
    ImageResponse: function ImageResponse(element: unknown, init?: ResponseInit) {
        return mockImageResponse(element, init);
    },
}));

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/chains", () => ({
    getAlchemyNetworkId: () => "base-sepolia",
    isProductionEnvironment: () => false,
    DEFAULT_CHAIN_LABEL: "Base Sepolia",
}));

vi.mock("viem", async (importOriginal) => {
    const actual = await importOriginal<typeof import("viem")>();
    return {
        ...actual,
        createPublicClient: () => ({
            readContract: (args: { functionName: string }) => mockReadContract(args),
        }),
    };
});

vi.mock("@supabase/supabase-js", () => ({
    createClient: () => ({
        from: (table: string) => {
            if (table === "drops") {
                return {
                    select: () => ({
                        ilike: () => ({ maybeSingle: () => mockDropMaybeSingle() }),
                        eq: () => ({ maybeSingle: () => mockDropMaybeSingle() }),
                    }),
                };
            }

            return {
                select: () => ({
                    eq: () => ({
                        order: () => ({
                            limit: () => ({
                                maybeSingle: () => mockIdentityMaybeSingle(),
                            }),
                        }),
                    }),
                }),
            };
        },
    }),
}));

import { GET } from "@/app/api/og/drop/[dropIdOrAddress]/route";

const ADDRESS = "0x2222222222222222222222222222222222222222";

function collectText(node: unknown): string {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(collectText).join(" ");
    if (node && typeof node === "object" && "props" in node) {
        const element = node as { props?: { children?: unknown } };
        return collectText(element.props?.children);
    }
    return "";
}

describe("OG Drop Rendering", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDropMaybeSingle.mockResolvedValue({ data: null, error: null });
        mockIdentityMaybeSingle.mockResolvedValue({ data: null, error: null });
    });

    it("backfills OG content from onchain metadata when the DB row is missing", async () => {
        mockReadContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
            if (functionName === "owner") return ADDRESS;
            if (functionName === "uri") return "ipfs://QmMetadata";
            if (functionName === "mintPrice") return BigInt(0);
            if (functionName === "editionSize") return BigInt(100);
            if (functionName === "totalMinted") return BigInt(12);
            throw new Error(`Unexpected function ${functionName}`);
        });
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                name: "Founder's Key",
                image: "ipfs://QmArtwork",
            }),
        });

        const res = await GET(new NextRequest(`https://droppitonbase.xyz/api/og/drop/${ADDRESS}`), {
            params: Promise.resolve({ dropIdOrAddress: ADDRESS }),
        });

        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toContain("public");

        const renderedText = collectText(mockImageResponse.mock.calls[0][0]);
        expect(renderedText).toContain("Founder's Key");
        expect(renderedText).toContain("Onchain creator");
        expect(renderedText).not.toContain("Untitled Drop");
    });

    it("marks fallback OG renders as no-store when metadata stays incomplete", async () => {
        mockReadContract.mockRejectedValue(new Error("RPC unavailable"));

        const res = await GET(new NextRequest(`https://droppitonbase.xyz/api/og/drop/${ADDRESS}`), {
            params: Promise.resolve({ dropIdOrAddress: ADDRESS }),
        });

        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toBe("no-store");

        const renderedText = collectText(mockImageResponse.mock.calls[0][0]);
        expect(renderedText).toContain("Untitled Drop");
        expect(renderedText).toContain("Unknown source");
    });
});

