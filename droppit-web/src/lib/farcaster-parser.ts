import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";

export const DropIntentSchema = z.object({
    title: z.string().describe("The name of the drop being created"),
    editionSize: z.number().int().positive().describe("Total supply limit"),
    mintPrice: z.string().describe("Mint price in ETH as a decimal string (e.g. \"0.001\" or \"0\" for free). Must be a non-negative number. Return as string, not number."),
    assetUri: z.string().optional().describe("Optional URI for the drop asset"),
    isReady: z.boolean().describe("True if all required fields were clearly found in the cast")
});

export async function initializeFarcasterParser() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");

    const model = new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash",
        apiKey,
        temperature: 0.1,
    });

    return {
        structuredLlm: model.withStructuredOutput(DropIntentSchema),
    };
}
