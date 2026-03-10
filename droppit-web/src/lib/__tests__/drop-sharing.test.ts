import { describe, expect, it } from "vitest";

import { buildDropShareCaption, buildWarpcastComposeHref, formatEditionSizeLabel } from "@/lib/drop-sharing";

describe("drop-sharing", () => {
    it("formats edition sizes for human-readable sharing", () => {
        expect(formatEditionSizeLabel(1)).toBe("1/1");
        expect(formatEditionSizeLabel("331")).toBe("331 editions");
        expect(formatEditionSizeLabel(0)).toBeNull();
    });

    it("builds concise one-line share captions without technical metadata", () => {
        const caption = buildDropShareCaption({
            title: "Founder's Key",
            priceLabel: "Free",
            chainLabel: "Base",
            intro: "\"Founder's Key\" is live on @droppit.",
            cta: "Collect:",
        });

        expect(caption).toBe("\"Founder's Key\" is live on @droppit. Free on Base. Collect:");
        expect(caption).not.toContain("\n");
        expect(caption).not.toContain("331 editions");
        expect(caption).not.toContain("Contract:");
        expect(caption).not.toContain("Source:");
    });

    it("keeps creator handles out of the compact caption and preserves compose links", () => {
        const caption = buildDropShareCaption({
            title: "Founder's Key",
            priceLabel: "0.01 ETH",
            chainLabel: "Base",
            creatorHandle: "@DropArtist",
            intro: "I just collected \"Founder's Key\" on @droppit.",
            cta: "Check it out:",
        });
        const composeHref = buildWarpcastComposeHref({
            text: caption,
            embedUrl: "https://droppit.ai/s/0xabc",
        });
        const parsed = new URL(composeHref);

        expect(caption).toBe("I just collected \"Founder's Key\" on @droppit. 0.01 ETH on Base. Check it out:");
        expect(caption).not.toContain("@dropartist");
        expect(caption).not.toContain("\n");
        expect(parsed.origin + parsed.pathname).toBe("https://warpcast.com/~/compose");
        expect(parsed.searchParams.get("text")).toBe("I just collected \"Founder's Key\" on @droppit. 0.01 ETH on Base. Check it out:");
        expect(parsed.searchParams.getAll("embeds[]")).toEqual(["https://droppit.ai/s/0xabc"]);
    });
});

