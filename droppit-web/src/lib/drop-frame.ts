import type { FrameButton } from "@/lib/frame-builder";

export interface DropFrameSpec {
    dropUrl: string;
    ogImageUrl: string;
    shareImageUrl: string;
    postUrl: string;
    mintUrl: string;
    shareUrl: string;
    launchUrl: string;
    buttons: FrameButton[];
}

export function getDropFrameSpec(baseUrl: string, contractAddress: string): DropFrameSpec {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const dropUrl = `${normalizedBaseUrl}/drop/base/${contractAddress}`;
    const ogImageUrl = `${normalizedBaseUrl}/api/og/drop/${contractAddress}`;
    const shareImageUrl = `${ogImageUrl}?variant=miniapp`;
    const postUrl = `${normalizedBaseUrl}/api/frame/drop/${contractAddress}`;
    const mintUrl = `${normalizedBaseUrl}/api/frame/drop/${contractAddress}/mint`;
    const shareUrl = `${normalizedBaseUrl}/s/${contractAddress}`;
    const launchUrl = `${dropUrl}?miniApp=true`;

    return {
        dropUrl,
        ogImageUrl,
        shareImageUrl,
        postUrl,
        mintUrl,
        shareUrl,
        launchUrl,
        buttons: [
            { action: "tx", label: "Mint", target: mintUrl },
            { action: "link", label: "Open mint page", target: dropUrl },
        ],
    };
}
