import { BRAND } from "@/lib/brand";
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

function getSplashImageUrl(frame: DropFrameSpec): string {
    return new URL("/apple-touch-icon.png", frame.dropUrl).toString();
}

function createEmbed(frame: DropFrameSpec, actionType: MiniAppActionType): MiniAppEmbed {
    return {
        version: "1",
        imageUrl: frame.shareImageUrl,
        aspectRatio: "3:2",
        button: {
            title: "Mint 1",
            action: {
                type: actionType,
                url: frame.launchUrl,
                name: BRAND.name,
                splashImageUrl: getSplashImageUrl(frame),
                splashBackgroundColor: BRAND.palette.bg0,
            },
        },
    };
}

export function getDropShareEmbeds(frame: DropFrameSpec) {
    return {
        miniapp: createEmbed(frame, "launch_miniapp"),
        frame: createEmbed(frame, "launch_frame"),
    };
}