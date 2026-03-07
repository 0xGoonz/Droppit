import { describe, expect, it } from "vitest";

import { MINIAPP_ARTWORK_BOUNDS, fitArtworkWithinBounds } from "@/lib/share-card-layout";

describe("share-card-layout", () => {
    it("preserves square artwork within bounds", () => {
        const placement = fitArtworkWithinBounds({ imageWidth: 1200, imageHeight: 1200 });

        expect(placement.width).toBeLessThanOrEqual(MINIAPP_ARTWORK_BOUNDS.width);
        expect(placement.height).toBeLessThanOrEqual(MINIAPP_ARTWORK_BOUNDS.height);
        expect(placement.width).toBe(placement.height);
    });

    it("preserves panoramic artwork without cropping", () => {
        const placement = fitArtworkWithinBounds({ imageWidth: 3000, imageHeight: 1000 });

        expect(placement.width).toBe(MINIAPP_ARTWORK_BOUNDS.width);
        expect(placement.height).toBeLessThan(MINIAPP_ARTWORK_BOUNDS.height);
        expect(placement.aspectRatio).toBe(3);
    });

    it("preserves tall artwork without cropping", () => {
        const placement = fitArtworkWithinBounds({ imageWidth: 1000, imageHeight: 3000 });

        expect(placement.height).toBe(MINIAPP_ARTWORK_BOUNDS.height);
        expect(placement.width).toBeLessThan(MINIAPP_ARTWORK_BOUNDS.width);
        expect(placement.aspectRatio).toBeCloseTo(1 / 3, 5);
    });
});
