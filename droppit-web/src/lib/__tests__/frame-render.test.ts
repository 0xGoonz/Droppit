import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";

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

import DropHead from "@/app/drop/base/[contractAddress]/head";
import { GET as FrameGET } from "@/app/api/frame/drop/[contractAddress]/route";

const ADDRESS = "0x1111111111111111111111111111111111111111";

describe("Drop Share-Link Frame Rendering", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.NEXT_PUBLIC_BASE_URL = "https://droppitonbase.xyz";
        mockMaybeSingle.mockResolvedValue({ data: { status: "LIVE" }, error: null });
        mockFetch.mockResolvedValue({ ok: true });
    });

    it("emits property-based frame tags on the canonical drop head", async () => {
        const head = await DropHead({ params: Promise.resolve({ contractAddress: ADDRESS }) });
        const html = renderToStaticMarkup(head);

        expect(html).toContain('property="fc:frame"');
        expect(html).toContain('property="fc:frame:image"');
        expect(html).toContain('property="fc:frame:post_url"');
        expect(html).toContain("Mint 1");
        expect(html).toContain("Open mint page");
        expect(html).not.toContain('name="fc:frame"');
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

