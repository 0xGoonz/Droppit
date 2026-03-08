import { BRAND } from "@/lib/brand";
import type { DraftShareSpec } from "@/lib/draft-share";
import type { DropFrameSpec } from "@/lib/drop-frame";

type MiniAppActionType = "launch_frame" | "launch_miniapp";

interface MiniAppEmbedAction {
    type: MiniAppActionType;
    url: string;
    name: string;
    splashImageUrl: string;
    splashBackgroundColor: string;
}

interface MiniAppEmbed {
    version: "1";
    imageUrl: string;
    aspectRatio: "3:2";
    button: {
        title: string;
        action: MiniAppEmbedAction;
    };
}

function getSplashImageUrl(baseUrl: string): string {
    return new URL("/apple-touch-icon.png", baseUrl).toString();
}

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, "");
}

function createEmbed(params: {
    baseUrl: string;
    imageUrl: string;
    actionType: MiniAppActionType;
    actionUrl: string;
    buttonTitle: string;
}): MiniAppEmbed {
    return {
        version: "1",
        imageUrl: params.imageUrl,
        aspectRatio: "3:2",
        button: {
            title: params.buttonTitle,
            action: {
                type: params.actionType,
                url: params.actionUrl,
                name: BRAND.name,
                splashImageUrl: getSplashImageUrl(params.baseUrl),
                splashBackgroundColor: BRAND.palette.bg0,
            },
        },
    };
}

export function getDropShareEmbeds(frame: DropFrameSpec) {
    return {
        miniapp: createEmbed({
            baseUrl: frame.dropUrl,
            imageUrl: frame.shareImageUrl,
            actionType: "launch_miniapp",
            actionUrl: frame.launchUrl,
            buttonTitle: "Mint",
        }),
        frame: createEmbed({
            baseUrl: frame.dropUrl,
            imageUrl: frame.shareImageUrl,
            actionType: "launch_frame",
            actionUrl: frame.launchUrl,
            buttonTitle: "Mint",
        }),
    };
}

export function getDraftShareEmbeds(share: DraftShareSpec) {
    return {
        miniapp: createEmbed({
            baseUrl: share.reviewUrl,
            imageUrl: share.shareImageUrl,
            actionType: "launch_miniapp",
            actionUrl: share.launchUrl,
            buttonTitle: share.buttonTitle,
        }),
        frame: createEmbed({
            baseUrl: share.reviewUrl,
            imageUrl: share.shareImageUrl,
            actionType: "launch_frame",
            actionUrl: share.launchUrl,
            buttonTitle: share.buttonTitle,
        }),
    };
}

export function getHomeMiniAppEmbeds(baseUrl: string) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const imageUrl = new URL("/miniapp/metadata/hero-1200x630.png", normalizedBaseUrl).toString();

    return {
        miniapp: createEmbed({
            baseUrl: normalizedBaseUrl,
            imageUrl,
            actionType: "launch_miniapp",
            actionUrl: normalizedBaseUrl,
            buttonTitle: "Open Droppit",
        }),
        frame: createEmbed({
            baseUrl: normalizedBaseUrl,
            imageUrl,
            actionType: "launch_frame",
            actionUrl: normalizedBaseUrl,
            buttonTitle: "Open Droppit",
        }),
    };
}
