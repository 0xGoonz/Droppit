import { initializeFarcasterAgent } from "@/lib/agent";
import { validateEditionSize, validateMintPriceWei, validateTitle } from "@/lib/validation/drops";
import { parseEther } from "viem";

export interface ParsedDropIntent {
    success: boolean;
    title?: string;
    editionSize?: number;
    mintPrice?: string;   // Canonical wei string (no floats)
    assetUri?: string;
    error?: string;
}

export async function parseDeployIntent(castText: string): Promise<ParsedDropIntent> {
    const { structuredLlm } = await initializeFarcasterAgent();

    // AI parses the cast text to extract strict semantic intents:
    const dropIntent = await structuredLlm.invoke(`Parse this cast for a drop: "${castText}"`);

    if (!dropIntent.isReady || !dropIntent.title) {
        return {
            success: false,
            error: "Cast did not contain enough context (needs Title, Edition Size, Price)"
        };
    }

    // ── Strict validation — no fallbacks ──────────────────────

    const titleCheck = validateTitle(dropIntent.title);
    if (!titleCheck.valid) {
        return { success: false, error: `Invalid title: ${titleCheck.error}` };
    }

    // Fail if editionSize is missing or invalid — no silent coercion to 100
    if (dropIntent.editionSize === undefined || dropIntent.editionSize === null) {
        return { success: false, error: "Missing field: editionSize is required." };
    }

    const editionCheck = validateEditionSize(dropIntent.editionSize);
    if (!editionCheck.valid) {
        return { success: false, error: `Invalid editionSize (${dropIntent.editionSize}): ${editionCheck.error}` };
    }

    // Fail if mintPrice is missing or invalid — no silent coercion to "0"
    if (dropIntent.mintPrice === undefined || dropIntent.mintPrice === null) {
        return { success: false, error: "Missing field: mintPrice is required." };
    }

    // ── Normalize ETH → wei ──────────────────────────────────
    // The LLM returns mintPrice as a human-readable ETH string (e.g. "0.001").
    // We must convert to a canonical wei string before validation to avoid
    // float drift and to match the DB column's expected format.

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

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Converts a human-readable ETH price string to a canonical wei string.
 *
 * Handles:
 *  - Pure integer strings already in wei (e.g. "1000000000000000")
 *  - ETH decimal strings (e.g. "0.001" → "1000000000000000")
 *  - Zero / free (e.g. "0", "0.0")
 *
 * Returns null if the input is not a valid non-negative number.
 */
function normalizeEthToWei(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Reject obviously invalid inputs (letters other than scientific notation, symbols, etc.)
    // Allow digits, a single decimal point, and optionally a leading minus (caught later)
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return null;
    }

    // Reject negative values
    if (trimmed.startsWith("-")) {
        return null;
    }

    // If it's already a pure integer string, check if it looks like wei (>= 18 digits)
    // or a small integer that was meant as ETH. We use a heuristic:
    // - If the string has no decimal point AND is a very large number (>= 15 digits),
    //   treat it as raw wei already.
    // - Otherwise treat it as ETH.
    if (/^\d+$/.test(trimmed) && trimmed.length >= 15) {
        // Already looks like a wei value — pass through as-is
        return trimmed;
    }

    // Convert ETH → wei using viem's parseEther (handles decimals precisely)
    try {
        const wei = parseEther(trimmed);
        return wei.toString();
    } catch {
        return null;
    }
}
