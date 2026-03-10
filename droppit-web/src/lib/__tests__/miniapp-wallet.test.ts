import { describe, expect, it, vi } from "vitest";

import {
    FARCASTER_CONNECTOR_ID,
    MINIAPP_AUTO_CONNECT_SUPPRESSION_KEY,
    hasMiniAppQueryHint,
    hasSelectedChainMismatch,
    isMiniAppAutoConnectSuppressed,
    shouldAttemptMiniAppAutoConnect,
    shouldShowMiniAppConnectingState,
    suppressMiniAppAutoConnect,
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
