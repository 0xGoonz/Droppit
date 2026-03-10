import { DEFAULT_CHAIN_ID, isSupportedChainId, type SupportedChainId } from "@/lib/chains";

export const CHAIN_PREFERENCE_KEY = "droppit:chain";

export function parsePreferredChainId(rawValue: string | null): SupportedChainId | null {
    if (!rawValue) return null;
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed)) return null;
    if (!isSupportedChainId(parsed)) return null;
    return parsed;
}

export function readPreferredChainId(): SupportedChainId {
    if (typeof window === "undefined") return DEFAULT_CHAIN_ID;
    return parsePreferredChainId(window.localStorage.getItem(CHAIN_PREFERENCE_KEY)) || DEFAULT_CHAIN_ID;
}

export function persistPreferredChainId(chainId: SupportedChainId): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CHAIN_PREFERENCE_KEY, String(chainId));
}
