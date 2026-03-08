import { formatEther } from "viem";
import { DEFAULT_CHAIN_LABEL } from "@/lib/chains";
import { BRAND } from "@/lib/brand";

export const OG_TOKENS = {
    width: 1200,
    height: 630,
    safeX: 56,
    safeY: 44,
    artSize: 320,
    radius: 24,
    titleSize: 62,
    subtitleSize: 24,
    bodySize: 22,
    badgeSize: 20,
} as const;

export const OG_BRAND = {
    background: BRAND.palette.bg0,
    panel: BRAND.palette.bg1,
    blue: BRAND.palette.brand500,
    cyan: BRAND.palette.cyan400,
    violet: BRAND.palette.violet500,
    pink: BRAND.palette.pink500,
    text0: BRAND.palette.text0,
    text1: BRAND.palette.text1,
    text2: "#94a3b8",
} as const;

export type DraftTitlePresentation = {
    fontSize: number;
    lineHeight: number;
    letterSpacing: string;
    maxWidth: number;
};

export function ogFontFamily(): string {
    return "\"Plus Jakarta Sans\", \"Space Grotesk\", Inter, system-ui, sans-serif";
}

export function ogBackdrop(accentGlow: string): string {
    return `radial-gradient(circle at 12% 0%, ${accentGlow}, transparent 48%), radial-gradient(circle at 88% 0%, rgba(34,211,238,0.14), transparent 40%)`;
}

export function getChainLabel(): string {
    return DEFAULT_CHAIN_LABEL;
}

export function truncateText(input: string, maxChars: number): string {
    if (input.length <= maxChars) return input;
    return `${input.slice(0, Math.max(1, maxChars - 3))}...`;
}

export function truncateMiddle(input: string, start = 6, end = 4): string {
    if (input.length <= start + end + 3) return input;
    return `${input.slice(0, start)}...${input.slice(-end)}`;
}

const BLOCKED_HOSTNAMES = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "169.254.169.254",
    "[::1]",
    "metadata.google.internal",
];

function isSafeImageUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") return false;
        const hostname = parsed.hostname.toLowerCase();
        if (BLOCKED_HOSTNAMES.includes(hostname)) return false;
        if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) return false;
        return true;
    } catch {
        return false;
    }
}

function normalizeGatewayBase(raw: string): string {
    const trimmed = raw.trim().replace(/\/+$/, "");
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function getConfiguredIpfsGatewayBase(): string {
    const configuredGateway = process.env.NEXT_PUBLIC_GATEWAY_URL?.trim();
    if (!configuredGateway) return "https://gateway.pinata.cloud";
    return normalizeGatewayBase(configuredGateway);
}

function getIpfsGatewayBases(preferredGatewayBase?: string | null): string[] {
    const preferred = preferredGatewayBase ? normalizeGatewayBase(preferredGatewayBase) : null;
    const configured = getConfiguredIpfsGatewayBase();
    const defaults = ["https://gateway.pinata.cloud"];
    return [preferred, configured, ...defaults].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
}

function stripIpfsPrefix(raw: string): string {
    return raw
        .replace(/^ipfs:\/\//i, "")
        .replace(/^ipfs\//i, "")
        .replace(/^\/+/, "");
}

export function getIpfsHttpCandidates(raw: string | null | undefined, preferredGatewayBase?: string | null): string[] {
    if (!raw || typeof raw !== "string") return [];
    if (raw.startsWith("ipfs://")) {
        const path = stripIpfsPrefix(raw);
        if (!path) return [];
        return getIpfsGatewayBases(preferredGatewayBase).map((base) => `${base}/ipfs/${path}`);
    }
    if (!isSafeImageUrl(raw)) return [];
    return [raw];
}

export function normalizeIpfsToHttp(raw: string | null | undefined, preferredGatewayBase?: string | null): string | null {
    return getIpfsHttpCandidates(raw, preferredGatewayBase)[0] ?? null;
}

export function formatMintPriceWei(raw: string | null | undefined): string {
    if (!raw || raw === "0") return "Free";
    try {
        const formatted = formatEther(BigInt(raw));
        const [whole, frac = ""] = formatted.split(".");
        const trimmed = frac.slice(0, 4).replace(/0+$/g, "");
        return `${whole}${trimmed ? `.${trimmed}` : ""} ETH`;
    } catch {
        return "Price unavailable";
    }
}

export function formatStatusLabel(rawStatus: string | null | undefined): string {
    if (!rawStatus) return "UNKNOWN";
    return rawStatus.replace(/_/g, " ").toUpperCase();
}

export function statusBadgeColors(rawStatus: string | null | undefined): { bg: string; fg: string; border: string } {
    const status = (rawStatus || "").toUpperCase();
    if (status === "LIVE" || status === "PUBLISHED") {
        return { bg: "rgba(22,163,74,0.18)", fg: "#86efac", border: "rgba(34,197,94,0.35)" };
    }
    if (status === "DRAFT") {
        return { bg: "rgba(250,204,21,0.15)", fg: "#fde68a", border: "rgba(250,204,21,0.30)" };
    }
    return { bg: "rgba(148,163,184,0.15)", fg: "#cbd5e1", border: "rgba(148,163,184,0.30)" };
}

export function creatorAttribution(
    creatorAddress: string | null | undefined,
    creatorFid: number | null | undefined,
    creatorHandle?: string | null
): string {
    if (creatorHandle) return `@${creatorHandle}`;
    if (creatorAddress) return truncateMiddle(creatorAddress, 8, 6);
    if (creatorFid) return `FID ${creatorFid}`;
    return "Unknown creator";
}

export function deterministicAccent(seed: string): { from: string; to: string; glow: string } {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const hueA = hash % 360;
    const hueB = (hueA + 42) % 360;
    return {
        from: `hsl(${hueA}, 74%, 52%)`,
        to: `hsl(${hueB}, 72%, 46%)`,
        glow: `hsla(${hueA}, 82%, 60%, 0.25)`,
    };
}

export function fallbackTitle(raw: string | null | undefined, defaultTitle: string): string {
    if (!raw || !raw.trim()) return defaultTitle;
    return raw.trim();
}

export function getDraftTitlePresentation(title: string): DraftTitlePresentation {
    const length = title.trim().length;

    if (length >= 32) {
        return {
            fontSize: 52,
            lineHeight: 1.1,
            letterSpacing: "-0.022em",
            maxWidth: 640,
        };
    }

    if (length >= 20) {
        return {
            fontSize: 58,
            lineHeight: 1.06,
            letterSpacing: "-0.028em",
            maxWidth: 700,
        };
    }

    return {
        fontSize: OG_TOKENS.titleSize,
        lineHeight: 1.02,
        letterSpacing: "-0.03em",
        maxWidth: 760,
    };
}