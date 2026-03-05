/**
 * Shared Input Validators for Droppit
 * 
 * Used by: api/drops, api/drops/[id]/publish, api/webhooks/neynar
 * Ensures consistent 4xx error messages across web, webhook, and frame paths.
 */

import { isAddress } from "viem";

// ── Edition Size ────────────────────────────────────────────────

export function validateEditionSize(raw: unknown): { valid: true; value: number } | { valid: false; error: string } {
    const n = typeof raw === "string" ? parseInt(raw, 10) : typeof raw === "number" ? raw : NaN;

    if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { valid: false, error: "editionSize must be an integer." };
    }
    if (n < 1 || n > 10_000) {
        return { valid: false, error: "editionSize must be between 1 and 10,000." };
    }
    return { valid: true, value: n };
}

// ── Mint Price (Wei) ────────────────────────────────────────────

/**
 * Validates a wei value supplied as a string.
 * Returns the canonical string representation (no floats, no precision loss).
 * Accepts "0", positive integer strings, or bigint-compatible strings.
 */
export function validateMintPriceWei(raw: unknown): { valid: true; value: string } | { valid: false; error: string } {
    if (raw === undefined || raw === null || raw === "") {
        return { valid: true, value: "0" }; // Default free mint
    }

    const s = String(raw).trim();

    // Must be a non-negative integer string (no decimals, no scientific notation)
    if (!/^\d+$/.test(s)) {
        return { valid: false, error: "mintPriceWei must be a non-negative integer string (wei). No decimals or scientific notation." };
    }

    // Verify BigInt parsability (catches overflow/gibberish)
    try {
        const bi = BigInt(s);
        if (bi < BigInt(0)) {
            return { valid: false, error: "mintPriceWei cannot be negative." };
        }
        return { valid: true, value: bi.toString() };
    } catch {
        return { valid: false, error: "mintPriceWei is not a valid integer." };
    }
}

// ── EVM Address ──────────────────────────────────────────────────

export function validateEvmAddress(raw: unknown, fieldName: string): { valid: true; value: string } | { valid: false; error: string } {
    if (!raw || typeof raw !== "string") {
        return { valid: false, error: `${fieldName} is required.` };
    }

    const trimmed = raw.trim();

    if (!isAddress(trimmed)) {
        return { valid: false, error: `${fieldName} is not a valid EVM address.` };
    }

    return { valid: true, value: trimmed.toLowerCase() };
}

// ── Transaction Hash ─────────────────────────────────────────────

export function validateTxHash(raw: unknown): { valid: true; value: string } | { valid: false; error: string } {
    if (!raw || typeof raw !== "string") {
        return { valid: false, error: "txHash is required." };
    }

    const trimmed = raw.trim();

    // Standard 66-char hex string (0x + 64 hex chars)
    if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
        return { valid: false, error: "txHash must be a valid 66-character hex string (0x...)." };
    }

    return { valid: true, value: trimmed };
}

// ── Title ────────────────────────────────────────────────────────

export function validateTitle(raw: unknown): { valid: true; value: string } | { valid: false; error: string } {
    if (!raw || typeof raw !== "string" || !raw.trim()) {
        return { valid: false, error: "title is required." };
    }

    const trimmed = raw.trim();

    if (trimmed.length > 200) {
        return { valid: false, error: "title must be 200 characters or less." };
    }

    return { valid: true, value: trimmed };
}

// ── Locked Content ───────────────────────────────────────────────

const BLOCKED_PATTERNS = [
    /\b[a-z][a-z0-9+\-.]*:\/\//, // Schemes: http://, https://, ftp://
    /\bwww\./, // www. prefix
    /\b[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+\b/, // Bare domains
    /\b(\d{1,3}\.){3}\d{1,3}\b/, // IPv4 addresses
    /\[[^\]]+\]\([^)]+\)/, // Markdown links
    /<[^>]*>/, // Any HTML-like tags, including <http...>
];

export function validateLockedContent(raw: unknown): { valid: true; value: string | null } | { valid: false; error: string } {
    if (!raw || typeof raw !== "string" || !raw.trim()) {
        return { valid: true, value: null }; // Optional field
    }

    if (raw.length > 1000) {
        return { valid: false, error: "Locked content exceeds 1000 characters maximum." };
    }

    const normalized = raw.normalize("NFKC").toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, "");

    if (BLOCKED_PATTERNS.some(pattern => pattern.test(normalized))) {
        return { valid: false, error: "URLs and links are strictly prohibited in locked content for security reasons." };
    }

    return { valid: true, value: raw };
}
