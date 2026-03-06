'use client';

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { coinbaseWallet } from 'wagmi/connectors';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import type { Chain } from 'viem';
import { DEFAULT_CHAIN_ID, SUPPORTED_CHAINS, getSupportedChainById, isSupportedChainId, type SupportedChainId } from '@/lib/chains';
import { persistPreferredChainId, readPreferredChainId } from '@/lib/chain-preference';
import { getChainContracts, hasChainContractConfig } from '@/lib/contracts';
import { BRAND } from '@/lib/brand';

type ChainPreferenceContextValue = {
    selectedChain: Chain;
    selectedChainId: SupportedChainId;
    setSelectedChainId: (chainId: SupportedChainId) => void;
    isPreferenceHydrated: boolean;
    chainContracts: ReturnType<typeof getChainContracts>;
    hasSelectedChainContractConfig: boolean;
};

const ChainPreferenceContext = createContext<ChainPreferenceContextValue | null>(null);

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

    const [selectedChainId, setSelectedChainId] = useState<SupportedChainId>(DEFAULT_CHAIN_ID);
    const [isPreferenceHydrated, setIsPreferenceHydrated] = useState(false);
    const [isMiniAppEnvironment, setIsMiniAppEnvironment] = useState(false);

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
                const inMiniApp = await sdk.isInMiniApp();
                if (!isActive) return;

                setIsMiniAppEnvironment(inMiniApp);
                if (inMiniApp) {
                    await sdk.actions.ready();
                }
            } catch (error) {
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
    }), [
        selectedChain,
        selectedChainId,
        isPreferenceHydrated,
        chainContracts,
        hasSelectedChainContractConfig,
    ]);

    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
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