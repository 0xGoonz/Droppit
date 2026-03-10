import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const FACTORY_ADDRESS = "0x1111111111111111111111111111111111111111";
const CREATOR_ADDRESS = "0x2222222222222222222222222222222222222222";

const mockImageResponse = vi.fn((element: unknown, init?: ResponseInit) => new Response("image", {
    status: 200,
    headers: init?.headers,
}));
const mockDropMaybeSingle = vi.fn();
const mockIdentityMaybeSingle = vi.fn();
const mockEstimateContractGas = vi.fn();
const mockGetGasPrice = vi.fn();

vi.mock("next/og", () => ({
    ImageResponse: function ImageResponse(element: unknown, init?: ResponseInit) {
        return mockImageResponse(element, init);
    },
}));

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/chains", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/chains")>();
    return {
        ...actual,
        getAlchemyRpcUrl: () => "https://alchemy.test",
    };
});

vi.mock("@/lib/contracts", () => ({
    FACTORY_ABI: [],
    getChainContracts: () => ({ factoryAddress: FACTORY_ADDRESS }),
}));

vi.mock("viem", async (importOriginal) => {
    const actual = await importOriginal<typeof import("viem")>();
    return {
        ...actual,
        createPublicClient: () => ({
            estimateContractGas: (args: unknown) => mockEstimateContractGas(args),
            getGasPrice: () => mockGetGasPrice(),
        }),
    };
});

vi.mock("@/lib/supabase", () => ({
    getServiceRoleClient: () => ({
        from: (table: string) => {
            if (table === "drops") {
                return {
                    select: () => ({
                        eq: () => ({ maybeSingle: () => mockDropMaybeSingle() }),
                    }),
                };
            }

            if (table === "identity_links") {
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
            }

            throw new Error(`Unexpected table ${table}`);
        },
    }),
}));

import { GET, dynamic } from "@/app/api/og/draft/[draftId]/route";
import { getDraftTitlePresentation } from "@/lib/og-utils";

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

function makeDraft(overrides: Record<string, unknown> = {}) {
    return {
        id: "draft-1",
        title: "Founder's Key",
        status: "DRAFT",
        edition_size: 555,
        mint_price: "0",
        image_url: "ipfs://QmArtwork",
        creator_address: null,
        creator_fid: 1369465,
        agent_parse: null,
        ...overrides,
    };
}

describe("OG Draft Rendering", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.NEXT_PUBLIC_GATEWAY_URL = "droppit-gateway.mypinata.cloud";
        process.env.NEXT_PUBLIC_CHAIN_ID = "8453";
        mockDropMaybeSingle.mockResolvedValue({ data: makeDraft(), error: null });
        mockIdentityMaybeSingle.mockResolvedValue({ data: null, error: null });
        mockEstimateContractGas.mockResolvedValue(BigInt(21000));
        mockGetGasPrice.mockResolvedValue(BigInt(1_000_000_000));
    });

    it("keeps the hero title treatment for short names", () => {
        expect(getDraftTitlePresentation("Founder's Key")).toEqual({
            fontSize: 62,
            lineHeight: 1.02,
            letterSpacing: "-0.03em",
            maxWidth: 760,
        });
    });

    it("uses the medium title tier for moderately long names", () => {
        expect(getDraftTitlePresentation("Founder's Key Genesis Pass")).toEqual({
            fontSize: 58,
            lineHeight: 1.06,
            letterSpacing: "-0.028em",
            maxWidth: 700,
        });
    });

    it("uses the long title tier for extended draft names", () => {
        expect(getDraftTitlePresentation("Founder's Key Genesis Access Pass Volume II")).toEqual({
            fontSize: 52,
            lineHeight: 1.1,
            letterSpacing: "-0.022em",
            maxWidth: 640,
        });
    });

    it("renders accurate draft metadata with the persisted webhook author handle on first fetch", async () => {
        mockDropMaybeSingle.mockResolvedValue({
            data: makeDraft({ agent_parse: { authorHandle: "oxgnar" } }),
            error: null,
        });

        const res = await GET(new NextRequest("https://droppitonbase.xyz/api/og/draft/draft-1"), {
            params: Promise.resolve({ draftId: "draft-1" }),
        });

        expect(dynamic).toBe("force-dynamic");
        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toContain("no-store");

        const renderedTree = mockImageResponse.mock.calls[0][0];
        const renderedText = collectText(renderedTree);
        expect(renderedText).toContain("Founder's Key");
        expect(renderedText).toContain("Free");
        expect(renderedText).toContain("@oxgnar");
        expect(renderedText).not.toContain("Untitled Draft");
        expect(renderedText).not.toContain("Draft Preview");
        expect(renderedText).not.toContain("Est. Deploy");
        expect(findFirstImageSrc(renderedTree)).toBe("https://droppit-gateway.mypinata.cloud/ipfs/QmArtwork");
        expect(mockIdentityMaybeSingle).not.toHaveBeenCalled();
    });

    it("renders the miniapp variant as pure artwork with blurred fill", async () => {
        const res = await GET(new NextRequest("https://droppitonbase.xyz/api/og/draft/draft-1?variant=miniapp"), {
            params: Promise.resolve({ draftId: "draft-1" }),
        });

        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toContain("no-store");
        expect(mockEstimateContractGas).not.toHaveBeenCalled();
        expect(mockIdentityMaybeSingle).not.toHaveBeenCalled();

        const renderedTree = mockImageResponse.mock.calls[0][0];
        const renderedText = collectText(renderedTree);
        const miniappImage = findNodeByProp(renderedTree, "data-share-card-artwork", "miniapp");
        const artFill = findNodeByProp(renderedTree, "data-share-card-art-fill", "miniapp");
        const artStage = findNodeByProp(renderedTree, "data-share-card-art-stage", "miniapp");
        const artFrame = findNodeByProp(renderedTree, "data-share-card-art-frame", "miniapp");

        expect(findFirstImageSrc(renderedTree)).toBe("https://droppit-gateway.mypinata.cloud/ipfs/QmArtwork");
        expect(renderedText).not.toContain("Founder's Key");
        expect(renderedText).not.toContain("Free");
        expect(renderedText).not.toContain("Creator:");
        expect(renderedText).not.toContain("Draft ID:");
        expect(renderedText).not.toContain("Est. Deploy");
        expect(miniappImage?.props?.width).toBeDefined();
        expect(miniappImage?.props?.height).toBeDefined();
        expect(miniappImage?.props?.style).toMatchObject({ objectFit: "contain", objectPosition: "center" });
        expect(artFill?.props?.style).toMatchObject({ objectFit: "cover", filter: "blur(28px)" });
        expect(artStage?.props?.style).toMatchObject({ position: "relative", overflow: "hidden" });
        expect(artFrame?.props?.style).toMatchObject({ borderRadius: 28, position: "relative" });
    });

    it("keeps contain-fit artwork treatment for non-square draft images in the miniapp variant", async () => {
        mockDropMaybeSingle.mockResolvedValue({
            data: makeDraft({ image_url: "ipfs://QmTallArtwork" }),
            error: null,
        });

        const res = await GET(new NextRequest("https://droppitonbase.xyz/api/og/draft/draft-1?variant=miniapp"), {
            params: Promise.resolve({ draftId: "draft-1" }),
        });

        expect(res.status).toBe(200);

        const renderedTree = mockImageResponse.mock.calls[0][0];
        const miniappImage = findNodeByProp(renderedTree, "data-share-card-artwork", "miniapp");
        expect(findFirstImageSrc(renderedTree)).toBe("https://droppit-gateway.mypinata.cloud/ipfs/QmTallArtwork");
        expect(miniappImage?.props?.style).toMatchObject({ objectFit: "contain", objectPosition: "center" });
    });

    it("falls back to a wallet-linked handle when webhook handle metadata is missing", async () => {
        mockDropMaybeSingle.mockResolvedValue({
            data: makeDraft({ creator_address: CREATOR_ADDRESS, creator_fid: null }),
            error: null,
        });
        mockIdentityMaybeSingle.mockResolvedValue({ data: { handle: "linkedgoonz" }, error: null });

        const res = await GET(new NextRequest("https://droppitonbase.xyz/api/og/draft/draft-1"), {
            params: Promise.resolve({ draftId: "draft-1" }),
        });

        expect(res.status).toBe(200);
        const renderedText = collectText(mockImageResponse.mock.calls[0][0]);
        expect(renderedText).toContain("@linkedgoonz");
        expect(mockIdentityMaybeSingle).toHaveBeenCalledTimes(1);
    });

    it("falls back to the creator fid when no handle metadata is available", async () => {
        mockDropMaybeSingle.mockResolvedValue({
            data: makeDraft({ creator_address: null, creator_fid: 777, agent_parse: null }),
            error: null,
        });

        const res = await GET(new NextRequest("https://droppitonbase.xyz/api/og/draft/draft-1"), {
            params: Promise.resolve({ draftId: "draft-1" }),
        });

        expect(res.status).toBe(200);
        const renderedText = collectText(mockImageResponse.mock.calls[0][0]);
        expect(renderedText).toContain("FID 777");
        expect(mockIdentityMaybeSingle).not.toHaveBeenCalled();
    });

    it("uses wei mint prices directly for gas estimation and still renders the human price label", async () => {
        mockDropMaybeSingle.mockResolvedValue({
            data: makeDraft({ mint_price: "1000000000000000" }),
            error: null,
        });

        const res = await GET(new NextRequest("https://droppitonbase.xyz/api/og/draft/draft-1"), {
            params: Promise.resolve({ draftId: "draft-1" }),
        });

        expect(res.status).toBe(200);
        const gasEstimateCall = mockEstimateContractGas.mock.calls[0][0] as { args: unknown[] };
        expect(gasEstimateCall.args[0]).toBe(BigInt(555));
        expect(gasEstimateCall.args[1]).toBe(BigInt("1000000000000000"));
        const renderedText = collectText(mockImageResponse.mock.calls[0][0]);
        expect(renderedText).toContain("0.001 ETH");
    });

    it("shows the estimate badge only when the value is visually meaningful", async () => {
        mockEstimateContractGas.mockResolvedValue(BigInt(3_000_000));
        mockGetGasPrice.mockResolvedValue(BigInt(40_000_000_000));

        const res = await GET(new NextRequest("https://droppitonbase.xyz/api/og/draft/draft-1"), {
            params: Promise.resolve({ draftId: "draft-1" }),
        });

        expect(res.status).toBe(200);
        const renderedText = collectText(mockImageResponse.mock.calls[0][0]);
        expect(renderedText).toContain("Est. Deploy: ~0.1320 ETH");
    });

    it("hides only the estimate badge when gas estimation fails", async () => {
        mockEstimateContractGas.mockRejectedValue(new Error("estimate failed"));
        mockDropMaybeSingle.mockResolvedValue({
            data: makeDraft({ agent_parse: { authorHandle: "oxgnar" } }),
            error: null,
        });

        const res = await GET(new NextRequest("https://droppitonbase.xyz/api/og/draft/draft-1"), {
            params: Promise.resolve({ draftId: "draft-1" }),
        });

        expect(res.status).toBe(200);
        const renderedText = collectText(mockImageResponse.mock.calls[0][0]);
        expect(renderedText).toContain("Founder's Key");
        expect(renderedText).not.toContain("Est. Deploy");
    });
});

