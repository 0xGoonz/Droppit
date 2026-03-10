import { PinataSDK } from "pinata";

const jwt = process.env.PINATA_JWT!;
const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL!;

if (!jwt || !gateway) {
    console.warn("Missing Pinata credentials in .env.local.");
}

export const pinata = new PinataSDK({
    pinataJwt: jwt,
    pinataGateway: gateway,
});

/**
 * Utility to parse an ipfs:// URI into a viewable gateway URL
 */
export const ipfsToGateway = (uri: string): string => {
    if (!uri?.startsWith("ipfs://")) return uri;
    return `https://${gateway}/ipfs/${uri.replace("ipfs://", "")}`;
};
