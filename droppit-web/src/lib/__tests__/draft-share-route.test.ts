import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockMaybeSingle = vi.fn();

vi.mock("@/lib/supabase", () => ({
    getServiceRoleClient: () => ({
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockImplementation(() => mockMaybeSingle()),
        })),
    }),
}));

import { GET } from "@/app/s/draft/[draftId]/route";

function extractJsonMeta(html: string, name: string) {
    const match = html.match(new RegExp(`<meta name="${name}" content='([^']+)'`));
    expect(match?.[1]).toBeTruthy();

    const decoded = match![1]
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');

    return JSON.parse(decoded);
}

describe("Draft Share Route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.NEXT_PUBLIC_BASE_URL = "https://droppitonbase.xyz";
    });

    it("serves review-first launch metadata when reusable draft media exists", async () => {
        mockMaybeSingle.mockResolvedValue({
            data: {
                id: "draft-1",
                title: "Founder's Key",
                token_uri: "ipfs://QmToken",
                image_url: "ipfs://QmImage",
            },
            error: null,
        });

        const res = await GET(new NextRequest("https://droppitonbase.xyz/s/draft/draft-1"), {
            params: Promise.resolve({ draftId: "draft-1" }),
        });

        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('name="fc:miniapp"');
        expect(html).toContain('name="fc:frame"');
        expect(html).toContain("Review &amp; Deploy");

        const shareImageUrl = "https://droppitonbase.xyz/api/og/draft/draft-1?variant=miniapp";
        const miniapp = extractJsonMeta(html, "fc:miniapp");
        expect(miniapp.version).toBe("1");
        expect(miniapp.imageUrl).toBe(shareImageUrl);
        expect(miniapp.button.title).toBe("Review & Deploy");
        expect(miniapp.button.action.type).toBe("launch_miniapp");
        expect(miniapp.button.action.url).toBe("https://droppitonbase.xyz/create?draftId=draft-1&mode=review&miniApp=true");

        const frame = extractJsonMeta(html, "fc:frame");
        expect(frame.imageUrl).toBe(shareImageUrl);
        expect(frame.button.action.type).toBe("launch_frame");
        expect(frame.button.action.url).toBe("https://droppitonbase.xyz/create?draftId=draft-1&mode=review&miniApp=true");
        expect(html).toContain(`<meta property="og:image" content="${shareImageUrl}" />`);
        expect(html).toContain('<meta property="og:image:height" content="800" />');
        expect(html).toContain(`<meta name="twitter:image" content="${shareImageUrl}" />`);
    });

    it("serves upload-first launch metadata when reusable draft media is missing", async () => {
        mockMaybeSingle.mockResolvedValue({
            data: {
                id: "draft-1",
                title: "Founder's Key",
                token_uri: null,
                image_url: null,
            },
            error: null,
        });

        const res = await GET(new NextRequest("https://droppitonbase.xyz/s/draft/draft-1"), {
            params: Promise.resolve({ draftId: "draft-1" }),
        });

        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain("Upload High-Res");

        const shareImageUrl = "https://droppitonbase.xyz/api/og/draft/draft-1?variant=miniapp";
        const miniapp = extractJsonMeta(html, "fc:miniapp");
        expect(miniapp.imageUrl).toBe(shareImageUrl);
        expect(miniapp.button.title).toBe("Upload High-Res");
        expect(miniapp.button.action.url).toBe("https://droppitonbase.xyz/create?draftId=draft-1&mode=upload&miniApp=true");

        const frame = extractJsonMeta(html, "fc:frame");
        expect(frame.imageUrl).toBe(shareImageUrl);
        expect(frame.button.action.url).toBe("https://droppitonbase.xyz/create?draftId=draft-1&mode=upload&miniApp=true");
    });
});
