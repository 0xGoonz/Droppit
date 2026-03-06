import type { ImageDimensions } from "@/lib/media-validation";

export const MINIAPP_SHARE_CARD = {
    canvasWidth: 1200,
    canvasHeight: 800,
    stagePaddingX: 56,
    stagePaddingY: 44,
    artPanelWidthRatio: 0.55,
    artPaddingX: 40,
    artPaddingY: 40,
    previewMaxWidth: 620,
} as const;

export type ShareCardArtworkPlacement = ImageDimensions & {
    widthRatio: number;
    heightRatio: number;
    aspectRatio: number;
};

function roundPlacement(value: number): number {
    return Math.max(1, Math.round(value));
}

export function getMiniappArtworkBounds(): ImageDimensions {
    const cardWidth = MINIAPP_SHARE_CARD.canvasWidth - (MINIAPP_SHARE_CARD.stagePaddingX * 2);
    const cardHeight = MINIAPP_SHARE_CARD.canvasHeight - (MINIAPP_SHARE_CARD.stagePaddingY * 2);
    const artPanelWidth = cardWidth * MINIAPP_SHARE_CARD.artPanelWidthRatio;

    return {
        width: roundPlacement(artPanelWidth - (MINIAPP_SHARE_CARD.artPaddingX * 2)),
        height: roundPlacement(cardHeight - (MINIAPP_SHARE_CARD.artPaddingY * 2)),
    };
}

export const MINIAPP_ARTWORK_BOUNDS = getMiniappArtworkBounds();

export function fitArtworkWithinBounds(params: {
    imageWidth?: number | null;
    imageHeight?: number | null;
    maxWidth?: number;
    maxHeight?: number;
}): ShareCardArtworkPlacement {
    const maxWidth = params.maxWidth ?? MINIAPP_ARTWORK_BOUNDS.width;
    const maxHeight = params.maxHeight ?? MINIAPP_ARTWORK_BOUNDS.height;
    const hasIntrinsicSize = Boolean(
        params.imageWidth &&
        params.imageHeight &&
        params.imageWidth > 0 &&
        params.imageHeight > 0
    );

    if (!hasIntrinsicSize) {
        return {
            width: maxWidth,
            height: maxHeight,
            widthRatio: 1,
            heightRatio: 1,
            aspectRatio: maxWidth / maxHeight,
        };
    }

    const scale = Math.min(
        maxWidth / (params.imageWidth as number),
        maxHeight / (params.imageHeight as number)
    );
    const width = roundPlacement((params.imageWidth as number) * scale);
    const height = roundPlacement((params.imageHeight as number) * scale);

    return {
        width,
        height,
        widthRatio: width / maxWidth,
        heightRatio: height / maxHeight,
        aspectRatio: (params.imageWidth as number) / (params.imageHeight as number),
    };
}
