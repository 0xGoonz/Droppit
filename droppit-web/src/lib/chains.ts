import { base, baseSepolia } from "wagmi/chains";

export const SUPPORTED_CHAINS = [base, baseSepolia] as const;

export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]["id"];
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];
export type AlchemyNetworkId = "base-mainnet" | "base-sepolia";

export function isProductionEnvironment(
    environment = process.env.NEXT_PUBLIC_ENVIRONMENT
): boolean {
    return environment === "production";
}

export function getDefaultChain(): SupportedChain {
    return isProductionEnvironment() ? base : baseSepolia;
}

export function getAlchemyNetworkId(): AlchemyNetworkId {
    return isProductionEnvironment() ? "base-mainnet" : "base-sepolia";
}

export function getAlchemyRpcUrl(networkId: AlchemyNetworkId = getAlchemyNetworkId()): string | undefined {
    const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
    if (!apiKey) return undefined;
    return `https://${networkId}.g.alchemy.com/v2/${apiKey}`;
}

export function getCdpNetworkId(): AlchemyNetworkId {
    // CDP network IDs align with the same Base network labels we use for Alchemy.
    return getAlchemyNetworkId();
}

export const DEFAULT_CHAIN_ID: SupportedChainId = getDefaultChain().id;

export const DEFAULT_CHAIN_LABEL = isProductionEnvironment() ? "Base" : "Base Sepolia";

export function getSupportedChainById(chainId: number) {
    return SUPPORTED_CHAINS.find((chain) => chain.id === chainId) || null;
}

export function isSupportedChainId(chainId: number): chainId is SupportedChainId {
    return !!getSupportedChainById(chainId);
}
