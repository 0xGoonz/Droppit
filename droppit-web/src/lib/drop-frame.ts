import type { FrameButton } from "@/lib/frame-builder";

export interface DropFrameSpec {
    dropUrl: string;
    ogImageUrl: string;
    postUrl: string;
    mintUrl: string;
    buttons: FrameButton[];
}

export function getDropFrameSpec(baseUrl: string, contractAddress: string): DropFrameSpec {
    const dropUrl = `${baseUrl}/drop/base/${contractAddress}`;
    const ogImageUrl = `${baseUrl}/api/og/drop/${contractAddress}`;
    const postUrl = `${baseUrl}/api/frame/drop/${contractAddress}`;
    const mintUrl = `${baseUrl}/api/frame/drop/${contractAddress}/mint`;

    return {
        dropUrl,
        ogImageUrl,
        postUrl,
        mintUrl,
        buttons: [
            { action: "tx", label: "Mint 1", target: mintUrl },
            { action: "link", label: "Open mint page", target: dropUrl },
        ],
    };
}
