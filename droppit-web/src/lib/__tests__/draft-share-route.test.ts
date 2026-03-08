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
    return JSON.parse(match![1]);
}

describe("Draft Share Route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.NEXT_PUBLIC_BASE_URL = "https://droppitonbase.xyz";
        mockMaybeSingle.mockResolvedValue({
            data: { id: "draft-1", title: "Founder's Key", status: "DRAFT" },
            error: null,
        });
    });

    it("serves mini app and frame embed tags for a saved draft review launch", async () => {
        const res = await GET(new NextRequest("https://droppitonbase.xyz/s/draft/draft-1"), {
            params: Promise.resolve({ draftId: "draft-1" }),
        });

        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('name="fc:miniapp"');
        expect(html).toContain('name="fc:frame"');
        expect(html).not.toContain('property="fc:frame:button:1"');

        const miniapp = extractJsonMeta(html, "fc:miniapp");
        expect(miniapp.version).toBe("1");
        expect(miniapp.imageUrl).toBe("https://droppitonbase.xyz/api/og/draft/draft-1");
        expect(miniapp.button.title).toBe("Review Draft");
        expect(miniapp.button.action.type).toBe("launch_miniapp");
        expect(miniapp.button.action.url).toBe("https://droppitonbase.xyz/create?draftId=draft-1");

        const frame = extractJsonMeta(html, "fc:frame");
        expect(frame.button.action.type).toBe("launch_frame");
        expect(frame.button.action.url).toBe("https://droppitonbase.xyz/create?draftId=draft-1");
    });
});
