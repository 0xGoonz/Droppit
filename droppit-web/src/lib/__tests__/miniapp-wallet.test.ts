import { describe, expect, it, vi } from "vitest";

import {
    FARCASTER_CONNECTOR_ID,
    MINIAPP_AUTO_CONNECT_SUPPRESSION_KEY,
    MINIAPP_AUTO_CONNECT_TIMEOUT_MS,
    MINIAPP_AUTO_CONNECT_TIMEOUT_MESSAGE,
    getMiniAppAutoConnectFallbackMessage,
    hasMiniAppQueryHint,
    hasSelectedChainMismatch,
    isMiniAppAutoConnectSuppressed,
    shouldAttemptMiniAppAutoConnect,
    shouldShowMiniAppConnectingState,
    suppressMiniAppAutoConnect,
    withMiniAppAutoConnectTimeout,
} from "@/lib/miniapp-wallet";

describe("miniapp-wallet", () => {
    it("targets the Farcaster connector id for miniapp auto-connect", () => {
        expect(FARCASTER_CONNECTOR_ID).toBe("farcaster");
        expect(hasMiniAppQueryHint("?miniApp=true")).toBe(true);
        expect(hasMiniAppQueryHint("?foo=bar")).toBe(false);
    });

    it("attempts auto-connect only when the miniapp session is eligible", () => {
        expect(shouldAttemptMiniAppAutoConnect({
            isMiniAppEnvironment: true,
            isSuppressed: false,
            hasConnectedWallet: false,
            hasFarcasterConnector: true,
            hasAttemptedConnection: false,
        })).toBe(true);

        expect(shouldAttemptMiniAppAutoConnect({
            isMiniAppEnvironment: false,
            isSuppressed: false,
            hasConnectedWallet: false,
            hasFarcasterConnector: true,
            hasAttemptedConnection: false,
        })).toBe(false);

        expect(shouldAttemptMiniAppAutoConnect({
            isMiniAppEnvironment: true,
            isSuppressed: true,
            hasConnectedWallet: false,
            hasFarcasterConnector: true,
            hasAttemptedConnection: false,
        })).toBe(false);
    });

    it("tracks the session suppression flag", () => {
        const storage = {
            getItem: vi.fn().mockReturnValue("1"),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        };

        expect(isMiniAppAutoConnectSuppressed(storage)).toBe(true);
        suppressMiniAppAutoConnect(storage);
        expect(storage.setItem).toHaveBeenCalledWith(MINIAPP_AUTO_CONNECT_SUPPRESSION_KEY, "1");
    });

    it("shows the connecting state only while miniapp bootstrap is pending", () => {
        expect(shouldShowMiniAppConnectingState({
            isMiniAppEnvironment: true,
            isMiniAppWalletBootstrapping: true,
            hasConnectedWallet: false,
        })).toBe(true);

        expect(shouldShowMiniAppConnectingState({
            isMiniAppEnvironment: true,
            isMiniAppWalletBootstrapping: false,
            hasConnectedWallet: false,
        })).toBe(false);
    });

    it("allows slower desktop approvals to complete within the default timeout", async () => {
        vi.useFakeTimers();

        const autoConnect = withMiniAppAutoConnectTimeout(
            new Promise<string>((resolve) => {
                setTimeout(() => resolve("connected"), 5_000);
            })
        );
        const autoConnectAssertion = expect(autoConnect).resolves.toBe("connected");

        await vi.advanceTimersByTimeAsync(5_000);
        await autoConnectAssertion;

        vi.useRealTimers();
    });

    it("lets successful miniapp auto-connects complete before the timeout", async () => {
        await expect(
            withMiniAppAutoConnectTimeout(Promise.resolve("connected"), MINIAPP_AUTO_CONNECT_TIMEOUT_MS)
        ).resolves.toBe("connected");
    });

    it("fails fast when miniapp auto-connect never resolves", async () => {
        vi.useFakeTimers();

        const autoConnect = withMiniAppAutoConnectTimeout(
            new Promise<never>(() => undefined),
            25
        );
        const autoConnectAssertion = expect(autoConnect).rejects.toThrow(MINIAPP_AUTO_CONNECT_TIMEOUT_MESSAGE);

        await vi.advanceTimersByTimeAsync(25);
        await autoConnectAssertion;

        vi.useRealTimers();
    });

    it("returns a manual-connect fallback message after timeout or other failures", () => {
        expect(getMiniAppAutoConnectFallbackMessage(new Error(MINIAPP_AUTO_CONNECT_TIMEOUT_MESSAGE))).toContain("Connect manually");
        expect(getMiniAppAutoConnectFallbackMessage(new Error("connect failed"))).toContain("Connect manually");
    });

    it("detects wrong-chain prompts only for connected wallets", () => {
        expect(hasSelectedChainMismatch({
            hasConnectedWallet: true,
            walletChainId: 1,
            selectedChainId: 8453,
        })).toBe(true);

        expect(hasSelectedChainMismatch({
            hasConnectedWallet: false,
            walletChainId: 1,
            selectedChainId: 8453,
        })).toBe(false);
    });
});