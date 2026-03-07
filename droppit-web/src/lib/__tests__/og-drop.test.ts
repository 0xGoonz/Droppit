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

vi.mock("@/lib/supabase", () => ({
    getServiceRoleClient: () => ({
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

function findFirstImageSrc(node: unknown): string | null {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
        for (const child of node) {
            const nested = findFirstImageSrc(child);
            if (nested) return nested;
        }
        return null;
    }
    if ("type" in node && (node as { type?: unknown }).type === "img") {
        const props = (node as { props?: { src?: string } }).props;
        return props?.src || null;
    }
    if ("props" in node) {
        return findFirstImageSrc((node as { props?: { children?: unknown } }).props?.children ?? null);
    }
    return null;
}
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

function findNodeByProp(node: unknown, prop: string, expected: string): { props?: Record<string, unknown> } | null {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
        for (const child of node) {
            const nested = findNodeByProp(child, prop, expected);
            if (nested) return nested;
        }
        return null;
    }

    const element = node as { props?: Record<string, unknown> };
    if (element.props?.[prop] === expected) return element;
    return findNodeByProp(element.props?.children ?? null, prop, expected);
}

describe("OG Drop Rendering", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.NEXT_PUBLIC_GATEWAY_URL = "droppit-gateway.mypinata.cloud";
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
        expect(mockFetch).toHaveBeenCalledWith("https://droppit-gateway.mypinata.cloud/ipfs/QmMetadata", {
            cache: "no-store",
            headers: { Accept: "application/json" },
        });

        const renderedText = collectText(mockImageResponse.mock.calls[0][0]);
        expect(renderedText).toContain("Founder's Key");
        expect(renderedText).toContain("Creator:");
        expect(renderedText).toContain("Onchain creator");
        expect(renderedText).not.toContain("Untitled Drop");
    });

    it("falls back to the public gateway when the configured gateway misses fresh metadata", async () => {
        mockReadContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
            if (functionName === "owner") return ADDRESS;
            if (functionName === "uri") return "ipfs://QmMetadata";
            if (functionName === "mintPrice") return BigInt(0);
            if (functionName === "editionSize") return BigInt(100);
            if (functionName === "totalMinted") return BigInt(12);
            throw new Error(`Unexpected function ${functionName}`);
        });
        mockFetch
            .mockResolvedValueOnce({ ok: false })
            .mockResolvedValueOnce({
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
        expect(mockFetch).toHaveBeenNthCalledWith(1, "https://droppit-gateway.mypinata.cloud/ipfs/QmMetadata", {
            cache: "no-store",
            headers: { Accept: "application/json" },
        });
        expect(mockFetch).toHaveBeenNthCalledWith(2, "https://gateway.pinata.cloud/ipfs/QmMetadata", {
            cache: "no-store",
            headers: { Accept: "application/json" },
        });

        const renderedTree = mockImageResponse.mock.calls[0][0];
        const renderedText = collectText(renderedTree);
        expect(renderedText).toContain("Founder's Key");
        expect(findFirstImageSrc(renderedTree)).toBe("https://gateway.pinata.cloud/ipfs/QmArtwork");
    });

    it("prefers onchain metadata artwork for the miniapp variant when available", async () => {
        mockDropMaybeSingle.mockResolvedValue({
            data: {
                id: "drop-1",
                title: "Founder's Key",
                creator_address: ADDRESS,
                creator_fid: null,
                mint_price: "0",
                status: "LIVE",
                image_url: "https://gateway.pinata.cloud/ipfs/QmStoredArtwork",
                contract_address: ADDRESS,
                edition_size: 333,
            },
            error: null,
        });
        mockReadContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
            if (functionName === "uri") return "ipfs://QmMetadata";
            throw new Error(`Unexpected function ${functionName}`);
        });
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                name: "Founder's Key",
                image: "ipfs://QmOnchainArtwork",
            }),
        });

        const res = await GET(new NextRequest(`https://droppitonbase.xyz/api/og/drop/${ADDRESS}?variant=miniapp`), {
            params: Promise.resolve({ dropIdOrAddress: ADDRESS }),
        });

        expect(res.status).toBe(200);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const renderedTree = mockImageResponse.mock.calls[0][0];
        expect(findFirstImageSrc(renderedTree)).toBe("https://gateway.pinata.cloud/ipfs/QmOnchainArtwork");
    });

    it("falls back to stored DB artwork for the miniapp variant when token metadata lookup fails", async () => {
        mockDropMaybeSingle.mockResolvedValue({
            data: {
                id: "drop-1",
                title: "Founder's Key",
                creator_address: ADDRESS,
                creator_fid: null,
                mint_price: "0",
                status: "LIVE",
                image_url: "https://gateway.pinata.cloud/ipfs/QmStoredArtwork",
                contract_address: ADDRESS,
                edition_size: 333,
            },
            error: null,
        });
        mockReadContract.mockRejectedValue(new Error("RPC unavailable"));

        const res = await GET(new NextRequest(`https://droppitonbase.xyz/api/og/drop/${ADDRESS}?variant=miniapp`), {
            params: Promise.resolve({ dropIdOrAddress: ADDRESS }),
        });

        expect(res.status).toBe(200);
        expect(mockFetch).not.toHaveBeenCalled();

        const renderedTree = mockImageResponse.mock.calls[0][0];
        const renderedText = collectText(renderedTree);
        expect(findFirstImageSrc(renderedTree)).toBe("https://gateway.pinata.cloud/ipfs/QmStoredArtwork");
        expect(renderedText).toContain("333 editions");
    });
    it("renders the miniapp variant as artwork-first with a minimal bottom strip", async () => {
        mockReadContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
            if (functionName === "owner") return ADDRESS;
            if (functionName === "uri") return "ipfs://QmMetadata";
            if (functionName === "mintPrice") return BigInt(0);
            if (functionName === "editionSize") return BigInt(100);
            if (functionName === "totalMinted") return BigInt(12);
            throw new Error("Unexpected function " + functionName);
        });
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                name: "Founder's Key",
                image: "ipfs://QmArtwork",
            }),
        });

        const res = await GET(new NextRequest("https://droppitonbase.xyz/api/og/drop/" + ADDRESS + "?variant=miniapp"), {
            params: Promise.resolve({ dropIdOrAddress: ADDRESS }),
        });

        expect(res.status).toBe(200);

        const renderedTree = mockImageResponse.mock.calls[0][0];
        const renderedText = collectText(renderedTree);
        const miniappImage = findNodeByProp(renderedTree, "data-share-card-artwork", "miniapp");
        const artStage = findNodeByProp(renderedTree, "data-share-card-art-stage", "miniapp");
        const artFrame = findNodeByProp(renderedTree, "data-share-card-art-frame", "miniapp");
        const copyStrip = findNodeByProp(renderedTree, "data-share-card-copy-strip", "miniapp");

        expect(renderedText).toContain("Founder's Key");
        expect(renderedText).toContain("100 editions");
        expect(renderedText).not.toContain("Creator:");
        expect(renderedText).not.toContain("Source:");
        expect(renderedText).not.toContain("Contract:");
        expect(renderedText).not.toContain("Base Sepolia");
        expect(renderedText).not.toContain("Free");
        expect(miniappImage?.props?.width).toBeDefined();
        expect(miniappImage?.props?.height).toBeDefined();
        expect(miniappImage?.props?.style).toMatchObject({ objectFit: "contain", objectPosition: "center" });
        expect(artStage?.props?.style).toMatchObject({ backgroundColor: "rgba(3,7,18,0.72)" });
        expect(artStage?.props?.style).not.toHaveProperty("background");
        expect(artFrame?.props?.style).toMatchObject({ borderRadius: 28 });
        expect(copyStrip?.props?.style).toMatchObject({ borderRadius: 24 });
    });

    it("marks fallback OG renders as no-store when metadata stays incomplete", async () => {
        mockReadContract.mockRejectedValue(new Error("RPC unavailable"));

        const res = await GET(new NextRequest(`https://droppitonbase.xyz/api/og/drop/${ADDRESS}`), {
            params: Promise.resolve({ dropIdOrAddress: ADDRESS }),
        });

        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(mockFetch).not.toHaveBeenCalled();

        const renderedText = collectText(mockImageResponse.mock.calls[0][0]);
        expect(renderedText).toContain("Untitled Drop");
        expect(renderedText).toContain("Unknown source");
    });
});





