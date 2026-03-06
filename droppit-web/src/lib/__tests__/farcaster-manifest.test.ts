import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/.well-known/farcaster.json/route";

describe("Farcaster manifest route", () => {
    beforeEach(() => {
        process.env.NEXT_PUBLIC_BASE_URL = "https://droppitonbase.xyz";
        process.env.NEXT_PUBLIC_ENVIRONMENT = "production";
        delete process.env.FARCASTER_HEADER;
        delete process.env.FARCASTER_PAYLOAD;
        delete process.env.FARCASTER_SIGNATURE;
    });

    it("returns a complete miniapp manifest even before account association is configured", async () => {
        const res = GET();
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.accountAssociation).toBeUndefined();
        expect(json.miniapp.version).toBe("1");
        expect(json.miniapp.name).toBe("Droppit");
        expect(json.miniapp.subtitle).toBe("Create, mint, share on Base");
        expect(json.miniapp.description).toBe("Create and mint ERC-1155 drops on Base, then share them across Farcaster and the web.");
        expect(json.miniapp.tagline).toBe("Launch drops at feed speed.");
        expect(json.miniapp.primaryCategory).toBe("art-creativity");
        expect(json.miniapp.homeUrl).toBe("https://droppitonbase.xyz");
        expect(json.miniapp.iconUrl).toBe("https://droppitonbase.xyz/apple-touch-icon.png");
        expect(json.miniapp.heroImageUrl).toBe("https://droppitonbase.xyz/miniapp/metadata/hero-1200x630.png");
        expect(json.miniapp.ogTitle).toBe("Droppit on Base");
        expect(json.miniapp.ogDescription).toBe("Create and mint ERC-1155 drops on Base, then share them across Farcaster and the web.");
        expect(json.miniapp.ogImageUrl).toBe("https://droppitonbase.xyz/miniapp/metadata/hero-1200x630.png");
        expect(json.miniapp.screenshotUrls).toEqual([
            "https://droppitonbase.xyz/miniapp/metadata/screenshot-create.png",
            "https://droppitonbase.xyz/miniapp/metadata/screenshot-drop.png",
            "https://droppitonbase.xyz/miniapp/metadata/screenshot-success.png",
        ]);
        expect(json.miniapp.noindex).toBe(false);
        expect(json.miniapp.webhookUrl).toBeUndefined();
        expect(json.miniapp.requiredChains).toEqual(["eip155:8453"]);
        expect(json.miniapp.requiredCapabilities).toEqual(["actions.ready"]);
    });

    it("includes account association when Farcaster signing env vars are present", async () => {
        process.env.FARCASTER_HEADER = "header";
        process.env.FARCASTER_PAYLOAD = "payload";
        process.env.FARCASTER_SIGNATURE = "signature";

        const res = GET();
        const json = await res.json();

        expect(json.accountAssociation).toEqual({
            header: "header",
            payload: "payload",
            signature: "signature",
        });
    });
});
