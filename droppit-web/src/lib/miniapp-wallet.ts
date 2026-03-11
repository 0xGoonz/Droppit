"use client";

export const FARCASTER_CONNECTOR_ID = "farcaster";
export const MINIAPP_AUTO_CONNECT_SUPPRESSION_KEY = "droppit:miniapp:auto-connect:suppressed";
export const MINIAPP_AUTO_CONNECT_TIMEOUT_MS = 15_000;
export const MINIAPP_AUTO_CONNECT_TIMEOUT_MESSAGE = "Mini app wallet auto-connect timed out.";

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem" | "removeItem">;

export function hasMiniAppQueryHint(search: string): boolean {
    return new URLSearchParams(search).get("miniApp") === "true";
}

export function getSessionStorageSafe(): Storage | null {
    if (typeof window === "undefined") return null;
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

export function isMiniAppAutoConnectSuppressed(storage: StorageReader | null | undefined): boolean {
    try {
        return storage?.getItem(MINIAPP_AUTO_CONNECT_SUPPRESSION_KEY) === "1";
    } catch {
        return false;
    }
}

export function suppressMiniAppAutoConnect(storage: StorageWriter | null | undefined): void {
    try {
        storage?.setItem(MINIAPP_AUTO_CONNECT_SUPPRESSION_KEY, "1");
    } catch {
        // Ignore storage failures and fall back to default behavior.
    }
}

export function shouldAttemptMiniAppAutoConnect(params: {
    isMiniAppEnvironment: boolean;
    isSuppressed: boolean;
    hasConnectedWallet: boolean;
    hasFarcasterConnector: boolean;
    hasAttemptedConnection: boolean;
}): boolean {
    return (
        params.isMiniAppEnvironment
        && !params.isSuppressed
        && !params.hasConnectedWallet
        && params.hasFarcasterConnector
        && !params.hasAttemptedConnection
    );
}

export function shouldShowMiniAppConnectingState(params: {
    isMiniAppEnvironment: boolean;
    isMiniAppWalletBootstrapping: boolean;
    hasConnectedWallet: boolean;
}): boolean {
    return (
        params.isMiniAppEnvironment
        && params.isMiniAppWalletBootstrapping
        && !params.hasConnectedWallet
    );
}


export function withMiniAppAutoConnectTimeout<T>(
    promise: Promise<T>,
    timeoutMs = MINIAPP_AUTO_CONNECT_TIMEOUT_MS
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeoutId = globalThis.setTimeout(() => {
            reject(new Error(MINIAPP_AUTO_CONNECT_TIMEOUT_MESSAGE));
        }, timeoutMs);

        promise.then(
            (value) => {
                globalThis.clearTimeout(timeoutId);
                resolve(value);
            },
            (error) => {
                globalThis.clearTimeout(timeoutId);
                reject(error);
            }
        );
    });
}

export function getMiniAppAutoConnectFallbackMessage(error: unknown): string {
    if (error instanceof Error && error.message === MINIAPP_AUTO_CONNECT_TIMEOUT_MESSAGE) {
        return "Farcaster wallet auto-connect is taking longer than expected. Connect manually to continue.";
    }

    return "Farcaster wallet auto-connect did not finish. Connect manually to continue.";
}

export function hasSelectedChainMismatch(params: {
    hasConnectedWallet: boolean;
    walletChainId?: number | null;
    selectedChainId: number;
}): boolean {
    return (
        params.hasConnectedWallet
        && params.walletChainId != null
        && params.walletChainId !== params.selectedChainId
    );
}