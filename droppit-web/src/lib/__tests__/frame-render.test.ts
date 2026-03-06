import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockMaybeSingle = vi.fn();
const mockFetch = vi.fn();

global.fetch = mockFetch as typeof fetch;

vi.mock("@supabase/supabase-js", () => ({
    createClient: () => ({
        from: () => ({
            select: () => ({
                ilike: () => ({
                    maybeSingle: () => mockMaybeSingle(),
                }),
            }),
        }),
    }),
}));

import { GET as ShareRouteGET } from "@/app/s/[contractAddress]/route";
import { GET as FrameGET } from "@/app/api/frame/drop/[contractAddress]/route";

const ADDRESS = "0x1111111111111111111111111111111111111111";

function extractJsonMeta(html: string, name: string) {
    const match = html.match(new RegExp(`<meta name="${name}" content='([^']+)'`));
    expect(match?.[1]).toBeTruthy();
    return JSON.parse(match![1]);
}

describe("Drop Share-Link Frame Rendering", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.NEXT_PUBLIC_BASE_URL = "https://droppitonbase.xyz";
        mockMaybeSingle.mockResolvedValue({ data: { status: "LIVE" }, error: null });
        mockFetch.mockResolvedValue({ ok: true });
    });

    it("serves mini app embed tags from the dedicated share route", async () => {
        const res = await ShareRouteGET(new NextRequest(`https://droppitonbase.xyz/s/${ADDRESS}`), {
            params: Promise.resolve({ contractAddress: ADDRESS }),
        });

        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('name="fc:miniapp"');
        expect(html).toContain('name="fc:frame"');
        expect(html).not.toContain('property="fc:frame:button:1"');

        const miniapp = extractJsonMeta(html, "fc:miniapp");
        expect(miniapp.version).toBe("1");
        expect(miniapp.aspectRatio).toBe("3:2");
        expect(miniapp.imageUrl).toContain(`/api/og/drop/${ADDRESS}?variant=miniapp`);
        expect(miniapp.button.title).toBe("Mint 1");
        expect(miniapp.button.action.type).toBe("launch_miniapp");
        expect(miniapp.button.action.url).toBe(`https://droppitonbase.xyz/drop/base/${ADDRESS}?miniApp=true`);

        const legacyFrame = extractJsonMeta(html, "fc:frame");
        expect(legacyFrame.button.action.type).toBe("launch_frame");
    });

    it("renders exactly two collector frame buttons and omits the Gift CTA", async () => {
        const res = await FrameGET(new NextRequest(`https://droppitonbase.xyz/api/frame/drop/${ADDRESS}`), {
            params: Promise.resolve({ contractAddress: ADDRESS }),
        });

        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('fc:frame:button:1');
        expect(html).toContain('fc:frame:button:2');
        expect(html).not.toContain('fc:frame:button:3');
        expect(html).toContain("Mint 1");
        expect(html).toContain("Open mint page");
        expect(html).not.toContain("Gift");
    });
});