import { initializeFarcasterParser } from "@/lib/farcaster-parser";
import { validateEditionSize, validateMintPriceWei, validateTitle } from "@/lib/validation/drops";
import { parseEther } from "viem";

export interface ParsedDropIntent {
    success: boolean;
    title?: string;
    editionSize?: number;
    mintPrice?: string;
    assetUri?: string;
    error?: string;
}

export async function parseDeployIntent(castText: string): Promise<ParsedDropIntent> {
    const { structuredLlm } = await initializeFarcasterParser();

    const dropIntent = await structuredLlm.invoke(`Parse this cast for a drop: "${castText}"`);

    if (!dropIntent.isReady || !dropIntent.title) {
        return {
            success: false,
            error: "Cast did not contain enough context (needs Title, Edition Size, Price)"
        };
    }

    const titleCheck = validateTitle(dropIntent.title);
    if (!titleCheck.valid) {
        return { success: false, error: `Invalid title: ${titleCheck.error}` };
    }

    if (dropIntent.editionSize === undefined || dropIntent.editionSize === null) {
        return { success: false, error: "Missing field: editionSize is required." };
    }

    const editionCheck = validateEditionSize(dropIntent.editionSize);
    if (!editionCheck.valid) {
        return { success: false, error: `Invalid editionSize (${dropIntent.editionSize}): ${editionCheck.error}` };
    }

    if (dropIntent.mintPrice === undefined || dropIntent.mintPrice === null) {
        return { success: false, error: "Missing field: mintPrice is required." };
    }

    const weiString = normalizeEthToWei(String(dropIntent.mintPrice));
    if (weiString === null) {
        return {
            success: false,
            error: `Invalid mintPrice ("${dropIntent.mintPrice}"): could not convert to wei. Use a non-negative decimal like "0.001" or "0".`
        };
    }

    const priceCheck = validateMintPriceWei(weiString);
    if (!priceCheck.valid) {
        return { success: false, error: `Invalid mintPrice ("${dropIntent.mintPrice}"): ${priceCheck.error}` };
    }

    return {
        success: true,
        title: titleCheck.value,
        editionSize: editionCheck.value,
        mintPrice: priceCheck.value,
        assetUri: dropIntent.assetUri
    };
}

function normalizeEthToWei(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return null;
    }

    if (trimmed.startsWith("-")) {
        return null;
    }

    if (/^\d+$/.test(trimmed) && trimmed.length >= 15) {
        return trimmed;
    }

    try {
        const wei = parseEther(trimmed);
        return wei.toString();
    } catch {
        return null;
    }
}
