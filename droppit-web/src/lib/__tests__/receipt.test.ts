import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock brand and chains modules used by receipt route
vi.mock("@/lib/brand", () => ({
    BRAND: { name: "Droppit", shortName: "Droppit" },
}));

vi.mock("@/lib/chains", () => ({
    isProductionEnvironment: () => false,
}));

import { GET } from "@/app/r/receipt/[txHash]/route";

const TX_HASH = `0x${"a".repeat(64)}`;

function createReq(variant?: string) {
    const url = variant
        ? `http://localhost/r/receipt/${TX_HASH}?variant=${variant}`
        : `http://localhost/r/receipt/${TX_HASH}`;
    return new NextRequest(url, { method: "GET" });
}

describe("Receipt Route (Item 46)", () => {
    it("returns 200 with Content-Type text/html", async () => {
        const res = await GET(createReq(), {
            params: Promise.resolve({ txHash: TX_HASH }),
        });

        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("text/html");
    });

    it("returns Cache-Control with public, max-age=3600", async () => {
        const res = await GET(createReq(), {
            params: Promise.resolve({ txHash: TX_HASH }),
        });

        const cacheControl = res.headers.get("Cache-Control") || "";
        expect(cacheControl).toContain("public");
        expect(cacheControl).toContain("max-age=3600");
        expect(cacheControl).toContain("stale-while-revalidate=86400");
    });

    it("includes OG meta tags in body", async () => {
        const res = await GET(createReq(), {
            params: Promise.resolve({ txHash: TX_HASH }),
        });

        const html = await res.text();
        expect(html).toContain('og:title');
        expect(html).toContain('og:image');
        expect(html).toContain('og:description');
        expect(html).toContain('twitter:card');
    });

    it("variant=card renders card variant image URL", async () => {
        const res = await GET(createReq("card"), {
            params: Promise.resolve({ txHash: TX_HASH }),
        });

        const html = await res.text();
        expect(html).toContain(`variant=card`);
    });

    it("defaults to square variant for unknown variant param", async () => {
        const res = await GET(createReq("unknown"), {
            params: Promise.resolve({ txHash: TX_HASH }),
        });

        const html = await res.text();
        // The render URL should default to square for unknown variants
        expect(html).toContain("variant=square");
    });

    it("includes explorer link for testnet in sandbox mode", async () => {
        const res = await GET(createReq(), {
            params: Promise.resolve({ txHash: TX_HASH }),
        });

        const html = await res.text();
        expect(html).toContain("sepolia.basescan.org");
        expect(html).toContain(`/tx/${TX_HASH}`);
    });
});
