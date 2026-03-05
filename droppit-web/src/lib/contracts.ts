import { base, baseSepolia } from "wagmi/chains";
import type { Chain } from "wagmi/chains";
import { formatEther } from "viem";

/** Chains supported by Droppit. Used for chain toggle UX. */
export const SUPPORTED_CHAINS: readonly Chain[] = [base, baseSepolia] as const;
export type SupportedChainId = typeof base.id | typeof baseSepolia.id;

export type ChainContractConfig = {
    factoryAddress: `0x${string}` | "";
    implementationAddress: `0x${string}` | "";
};

const defaultFactory = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "") as `0x${string}` | "";
const defaultImplementation = (process.env.NEXT_PUBLIC_IMPLEMENTATION_ADDRESS || "") as `0x${string}` | "";

export const CHAIN_CONTRACTS: Record<number, ChainContractConfig> = {
    [base.id]: {
        factoryAddress: ((process.env.NEXT_PUBLIC_BASE_FACTORY_ADDRESS ||
            defaultFactory) as `0x${string}` | ""),
        implementationAddress: ((process.env.NEXT_PUBLIC_BASE_IMPLEMENTATION_ADDRESS ||
            defaultImplementation) as `0x${string}` | ""),
    },
    [baseSepolia.id]: {
        factoryAddress: ((process.env.NEXT_PUBLIC_BASE_SEPOLIA_FACTORY_ADDRESS ||
            defaultFactory) as `0x${string}` | ""),
        implementationAddress: ((process.env.NEXT_PUBLIC_BASE_SEPOLIA_IMPLEMENTATION_ADDRESS ||
            defaultImplementation) as `0x${string}` | ""),
    },
};

export const PROTOCOL_FEE_PER_MINT_WEI = BigInt("100000000000000");
export const PROTOCOL_FEE_PER_MINT_ETH = formatEther(PROTOCOL_FEE_PER_MINT_WEI);
export const PROTOCOL_FEE_PER_MINT_LABEL = `${PROTOCOL_FEE_PER_MINT_ETH} ETH`;

export function getChainContracts(chainId: number): ChainContractConfig | null {
    return CHAIN_CONTRACTS[chainId] || null;
}

export function hasChainContractConfig(chainId: number): boolean {
    const config = getChainContracts(chainId);
    return !!(config?.factoryAddress && config?.implementationAddress);
}

export const FACTORY_ABI = [
    {
        type: "function",
        name: "createDrop",
        inputs: [
            { name: "editionSize", type: "uint256", internalType: "uint256" },
            { name: "mintPrice", type: "uint256", internalType: "uint256" },
            { name: "payoutRecipient", type: "address", internalType: "address payable" },
            { name: "tokenUri", type: "string", internalType: "string" },
            { name: "lockedMessageCommitment", type: "bytes32", internalType: "bytes32" }
        ],
        outputs: [{ name: "drop", type: "address", internalType: "address" }],
        stateMutability: "nonpayable"
    }
] as const;
