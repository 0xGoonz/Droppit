'use client';

import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { createConfig, http, useAccount, useConnect, WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { coinbaseWallet } from 'wagmi/connectors';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import type { Chain } from 'viem';
import { DEFAULT_CHAIN_ID, SUPPORTED_CHAINS, getSupportedChainById, isSupportedChainId, type SupportedChainId } from '@/lib/chains';
import { persistPreferredChainId, readPreferredChainId } from '@/lib/chain-preference';
import { getChainContracts, hasChainContractConfig } from '@/lib/contracts';
import { BRAND } from '@/lib/brand';
import {
    FARCASTER_CONNECTOR_ID,
    getMiniAppAutoConnectFallbackMessage,
    getSessionStorageSafe,
    hasMiniAppQueryHint,
    isMiniAppAutoConnectSuppressed,
    shouldAttemptMiniAppAutoConnect,
    withMiniAppAutoConnectTimeout,
} from '@/lib/miniapp-wallet';

type ChainPreferenceContextValue = {
    selectedChain: Chain;
    selectedChainId: SupportedChainId;
    setSelectedChainId: (chainId: SupportedChainId) => void;
    isPreferenceHydrated: boolean;
    chainContracts: ReturnType<typeof getChainContracts>;
    hasSelectedChainContractConfig: boolean;
    isMiniAppEnvironment: boolean;
    isMiniAppWalletBootstrapping: boolean;
    miniAppAutoConnectErrorMessage: string | null;
};

const ChainPreferenceContext = createContext<ChainPreferenceContextValue | null>(null);

function MiniAppWalletBootstrap({
    isDetectionReady,
    enabled,
    targetChainId,
    setAutoConnectErrorMessage,
    setIsBootstrapping,
}: {
    isDetectionReady: boolean;
    enabled: boolean;
    targetChainId: SupportedChainId;
    setAutoConnectErrorMessage: (value: string | null) => void;
    setIsBootstrapping: (value: boolean) => void;
}) {
    const { address } = useAccount();
    const { connectAsync, connectors } = useConnect();
    const attemptedRef = useRef(false);

    useEffect(() => {
        if (!isDetectionReady) return;

        if (!enabled) {
            attemptedRef.current = false;
            setAutoConnectErrorMessage(null);
            setIsBootstrapping(false);
            return;
        }

        const storage = getSessionStorageSafe();
        const farcasterConnector = connectors.find((connector) => connector.id === FARCASTER_CONNECTOR_ID);
        const hasConnectedWallet = Boolean(address);
        const isSuppressed = isMiniAppAutoConnectSuppressed(storage);

        if (hasConnectedWallet || isSuppressed) {
            setAutoConnectErrorMessage(null);
            setIsBootstrapping(false);
            return;
        }

        if (!shouldAttemptMiniAppAutoConnect({
            isMiniAppEnvironment: enabled,
            isSuppressed,
            hasConnectedWallet,
            hasFarcasterConnector: Boolean(farcasterConnector),
            hasAttemptedConnection: attemptedRef.current,
        })) {
            setIsBootstrapping(!farcasterConnector);
            return;
        }

        let isCancelled = false;
        attemptedRef.current = true;
        setAutoConnectErrorMessage(null);
        setIsBootstrapping(true);

        void (async () => {
            try {
                await withMiniAppAutoConnectTimeout(
                    connectAsync({ connector: farcasterConnector!, chainId: targetChainId })
                );
            } catch (error) {
                if (!isCancelled) {
                    setAutoConnectErrorMessage(getMiniAppAutoConnectFallbackMessage(error));
                }
                console.warn('[Farcaster Mini App] Wallet auto-connect failed:', error);
            } finally {
                if (!isCancelled) {
                    setIsBootstrapping(false);
                }
            }
        })();

        return () => {
            isCancelled = true;
        };
    }, [address, connectAsync, connectors, enabled, isDetectionReady, setAutoConnectErrorMessage, setIsBootstrapping, targetChainId]);

    return null;
}

export function useChainPreference() {
    const context = useContext(ChainPreferenceContext);
    if (!context) {
        throw new Error("useChainPreference must be used within Providers");
    }
    return context;
}

export function Providers({ children }: { children: ReactNode }) {
    const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY;

    if (!apiKey) {
        console.warn("NEXT_PUBLIC_ONCHAINKIT_API_KEY is missing from .env.local");
    }

    const miniAppQueryHint = hasMiniAppQueryHint(typeof window === 'undefined' ? '' : window.location.search);
    const [selectedChainId, setSelectedChainId] = useState<SupportedChainId>(DEFAULT_CHAIN_ID);
    const [isPreferenceHydrated, setIsPreferenceHydrated] = useState(false);
    const [isMiniAppDetectionReady, setIsMiniAppDetectionReady] = useState(false);
    const [isMiniAppEnvironment, setIsMiniAppEnvironment] = useState(miniAppQueryHint);
    const [isMiniAppWalletBootstrapping, setIsMiniAppWalletBootstrapping] = useState(miniAppQueryHint);
    const [miniAppAutoConnectErrorMessage, setMiniAppAutoConnectErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        const preferredChainId = readPreferredChainId();
        const hydrationFrame = window.requestAnimationFrame(() => {
            if (isSupportedChainId(preferredChainId)) {
                setSelectedChainId(preferredChainId);
            }
            setIsPreferenceHydrated(true);
        });

        return () => window.cancelAnimationFrame(hydrationFrame);
    }, []);

    useEffect(() => {
        let isActive = true;

        async function bootstrapMiniApp() {
            try {
                const { sdk } = await import('@farcaster/miniapp-sdk');
                const inMiniApp = await sdk.isInMiniApp().catch(() => false);
                if (!isActive) return;

                setIsMiniAppEnvironment(inMiniApp);
                setIsMiniAppWalletBootstrapping(inMiniApp);
                setIsMiniAppDetectionReady(true);

                if (inMiniApp) {
                    await sdk.actions.ready().catch((error) => {
                        console.warn('[Farcaster Mini App] ready() was not accepted:', error);
                    });
                }
            } catch (error) {
                if (!isActive) return;
                setIsMiniAppEnvironment(false);
                setIsMiniAppWalletBootstrapping(false);
                setMiniAppAutoConnectErrorMessage(null);
                setIsMiniAppDetectionReady(true);
                console.warn('[Farcaster Mini App] Failed to initialize SDK:', error);
            }
        }

        void bootstrapMiniApp();

        return () => {
            isActive = false;
        };
    }, []);

    useEffect(() => {
        if (!isPreferenceHydrated) return;
        persistPreferredChainId(selectedChainId);
    }, [isPreferenceHydrated, selectedChainId]);

    const selectedChain = getSupportedChainById(selectedChainId) || SUPPORTED_CHAINS[0];
    const chainContracts = getChainContracts(selectedChain.id);
    const hasSelectedChainContractConfig = hasChainContractConfig(selectedChain.id);

    const connectors = useMemo(() => {
        const defaultConnector = coinbaseWallet({
            appName: BRAND.name,
        });

        return isMiniAppEnvironment
            ? [farcasterMiniApp(), defaultConnector]
            : [defaultConnector];
    }, [isMiniAppEnvironment]);

    const config = useMemo(() => createConfig({
        chains: [...SUPPORTED_CHAINS],
        connectors,
        ssr: true,
        transports: {
            [SUPPORTED_CHAINS[0].id]: http(),
            [SUPPORTED_CHAINS[1].id]: http(),
        },
    }), [connectors]);

    const [queryClient] = useState(() => new QueryClient());

    const chainPreferenceValue = useMemo<ChainPreferenceContextValue>(() => ({
        selectedChain,
        selectedChainId,
        setSelectedChainId,
        isPreferenceHydrated,
        chainContracts,
        hasSelectedChainContractConfig,
        isMiniAppEnvironment,
        isMiniAppWalletBootstrapping,
        miniAppAutoConnectErrorMessage,
    }), [
        selectedChain,
        selectedChainId,
        isPreferenceHydrated,
        chainContracts,
        hasSelectedChainContractConfig,
        isMiniAppEnvironment,
        isMiniAppWalletBootstrapping,
        miniAppAutoConnectErrorMessage,
    ]);

    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <MiniAppWalletBootstrap
                    isDetectionReady={isMiniAppDetectionReady}
                    enabled={isMiniAppDetectionReady && isMiniAppEnvironment}
                    targetChainId={selectedChainId}
                    setAutoConnectErrorMessage={setMiniAppAutoConnectErrorMessage}
                    setIsBootstrapping={setIsMiniAppWalletBootstrapping}
                />
                <ChainPreferenceContext.Provider value={chainPreferenceValue}>
                    <OnchainKitProvider
                        apiKey={apiKey}
                        chain={selectedChain}
                    >
                        {children}
                    </OnchainKitProvider>
                </ChainPreferenceContext.Provider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
