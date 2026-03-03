import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as FrameMintPOST } from "@/app/api/frame/drop/[contractAddress]/mint/route";
import { encodeFunctionData } from "viem";

const DROP_ABI = [
    {
        type: "function",
        name: "mint",
        inputs: [{ name: "quantity", type: "uint256" }],
        stateMutability: "payable"
    }
] as const;

// Mock dependencies
const mockReadContract = vi.fn();

vi.mock("viem", async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        createPublicClient: () => ({
            readContract: (...args: any[]) => mockReadContract(...args)
        })
    };
});

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Frame Mint API", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Mock Neynar validation success by default (for button 1 = Tx)
        mockFetch.mockResolvedValue({
            json: async () => ({
                valid: true,
                action: { tapped_button: { index: 1 } }
            })
        });

        // Mock onchain reads: mintPrice = 1M wei, protocolFee = 500k wei
        mockReadContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
            if (functionName === "mintPrice") return BigInt(1000000);
            if (functionName === "protocolFeePerMint") return BigInt(500000);
            return BigInt(0);
        });
    });

    const createReq = (body: any) => new NextRequest("http://localhost/api/frame/drop/0x1111111111111111111111111111111111111111/mint", {
        method: "POST",
        body: JSON.stringify(body)
    });

    it("returns correct tx payload for valid mint request", async () => {
        const res = await FrameMintPOST(createReq({
            trustedData: { messageBytes: "0xdeadbeef" }
        }), { params: Promise.resolve({ contractAddress: "0x1111111111111111111111111111111111111111" }) });

        expect(res.status).toBe(200);
        const json = await res.json();

        // Required payload properties
        expect(json.chainId).toBe("eip155:8453");
        expect(json.method).toBe("eth_sendTransaction");
        expect(json.params.to).toBe("0x1111111111111111111111111111111111111111");

        // Value = price + fee = 1.5M wei
        expect(json.params.value).toBe("1500000");

        // Data = encodeFunctionData for mint(1)
        const expectedData = encodeFunctionData({
            abi: DROP_ABI,
            functionName: "mint",
            args: [BigInt(1)]
        });
        expect(json.params.data).toBe(expectedData);
    });

    it("returns link fallback on missing trustedData", async () => {
        const res = await FrameMintPOST(createReq({}), {
            params: Promise.resolve({ contractAddress: "0x1111111111111111111111111111111111111111" })
        });

        expect(res.status).toBe(400);
        const html = await res.text();
        expect(html).toContain("fc:frame:button:1:action");
        expect(html).toContain('"link"');
        expect(html).toContain("Open mint page");
    });

    it("returns link fallback if Neynar validation fails", async () => {
        mockFetch.mockResolvedValueOnce({
            json: async () => ({ valid: false })
        });

        const res = await FrameMintPOST(createReq({
            trustedData: { messageBytes: "0xdeadbeef" }
        }), { params: Promise.resolve({ contractAddress: "0x1111111111111111111111111111111111111111" }) });

        expect(res.status).toBe(400);
        const html = await res.text();
        expect(html).toContain("fc:frame:button:1:action");
        expect(html).toContain('"link"');
    });

    it("returns link fallback if contract reads fail", async () => {
        mockReadContract.mockRejectedValueOnce(new Error("RPC failed"));

        const res = await FrameMintPOST(createReq({
            trustedData: { messageBytes: "0xdeadbeef" }
        }), { params: Promise.resolve({ contractAddress: "0x1111111111111111111111111111111111111111" }) });

        expect(res.status).toBe(200); // the response is a 200 OK frame containing the redirect link
        const html = await res.text();
        expect(html).toContain("fc:frame:button:1:action");
        expect(html).toContain('"link"');
    });

    it("ignores user-provided quantity in payload and always mints 1", async () => {
        // Simulating a malicious payload where the user attempts to sneak in a 'quantity' modification 
        // in nested fields.
        const res = await FrameMintPOST(createReq({
            trustedData: { messageBytes: "0xdeadbeef", quantity: 100 },
            untrustedData: { quantity: 10, inputText: "10" },
            quantity: 5
        }), { params: Promise.resolve({ contractAddress: "0x1111111111111111111111111111111111111111" }) });

        expect(res.status).toBe(200);
        const json = await res.json();

        // Ensure the payable value mathematically computes to exactly 1 item
        // mintPrice (1M) + fee (500k) = 1.5M wei
        expect(json.params.value).toBe("1500000");

        // Ensure exactly 1 is passed to mint()
        const expectedData = encodeFunctionData({
            abi: DROP_ABI,
            functionName: "mint",
            args: [BigInt(1)]
        });
        expect(json.params.data).toBe(expectedData);
    });
});
