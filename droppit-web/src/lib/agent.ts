import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentKit, CdpEvmWalletProvider, wethActionProvider, walletActionProvider, erc20ActionProvider, cdpApiActionProvider, cdpEvmWalletActionProvider } from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { z } from "zod";
import { getCdpNetworkId } from "@/lib/chains";

export const DropIntentSchema = z.object({
    title: z.string().describe("The name of the drop being created"),
    editionSize: z.number().int().positive().describe("Total supply limit"),
    mintPrice: z.string().describe("Mint price in ETH as a decimal string (e.g. \"0.001\" or \"0\" for free). Must be a non-negative number. Return as string, not number."),
    assetUri: z.string().optional().describe("Optional URI for the drop asset"),
    isReady: z.boolean().describe("True if all required fields were clearly found in the cast")
});

/**
 * Initializes the AI Agent with CDP Wallet + Gemini 2.5 Flash for Structured Output.
 * This function creates an ephemeral agent instance for handling a Farcaster cast.
 */
export async function initializeFarcasterAgent() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");

    // Use Gemini 2.5 Flash for fast/cheap structured parsing & reasoning
    const model = new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash",
        apiKey: apiKey,
        temperature: 0.1, // Low temperature for deterministic extraction
    });

    const structuredLlm = model.withStructuredOutput(DropIntentSchema);

    // Setup CDP AgentKit Wallet using Coinbase credentials
    // Ensure you set CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY
    const walletProvider = await CdpEvmWalletProvider.configureWithWallet({
        networkId: getCdpNetworkId(),
    });

    // Instantiate AgentKit with Core & Wallet Actions
    const agentkit = await AgentKit.from({
        walletProvider,
        actionProviders: [
            wethActionProvider(),
            walletActionProvider(),
            erc20ActionProvider(),
            cdpApiActionProvider(),
            cdpEvmWalletActionProvider(),
        ],
    });

    const tools = await getLangChainTools(agentkit);

    return { structuredLlm, tools, walletProvider };
}
