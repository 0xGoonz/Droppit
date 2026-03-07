import type { ImageDimensions } from "@/lib/media-validation";

export const MINIAPP_SHARE_CARD = {
    canvasWidth: 1200,
    canvasHeight: 800,
    stagePaddingX: 48,
    stagePaddingY: 24,
    frameInset: 4,
    artPaddingX: 8,
    artPaddingTop: 0,
    artPaddingBottom: 0,
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
    const innerWidth = cardWidth - (MINIAPP_SHARE_CARD.frameInset * 2);
    const innerHeight = cardHeight - (MINIAPP_SHARE_CARD.frameInset * 2);

    return {
        width: roundPlacement(innerWidth - (MINIAPP_SHARE_CARD.artPaddingX * 2)),
        height: roundPlacement(
            innerHeight
            - MINIAPP_SHARE_CARD.artPaddingTop
            - MINIAPP_SHARE_CARD.artPaddingBottom
        ),
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





