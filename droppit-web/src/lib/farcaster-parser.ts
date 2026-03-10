import { z } from "zod";

export const DropIntentSchema = z.object({
    title: z.string().describe("The name of the drop being created"),
    editionSize: z.number().int().positive().describe("Total supply limit"),
    mintPrice: z.string().describe("Mint price in ETH as a decimal string (e.g. \"0.001\" or \"0\" for free). Must be a non-negative number. Return as string, not number."),
    assetUri: z.string().optional().describe("Optional URI for the drop asset"),
    isReady: z.boolean().describe("True if all required fields were clearly found in the cast")
});

const DROP_INTENT_JSON_SCHEMA = {
    type: "object",
    properties: {
        title: {
            type: "string",
            description: "The name of the drop being created"
        },
        editionSize: {
            type: "integer",
            description: "Total supply limit"
        },
        mintPrice: {
            type: "string",
            description: "Mint price in ETH as a decimal string (for example \"0.001\" or \"0\" for free)."
        },
        assetUri: {
            type: "string",
            description: "Optional URI for the drop asset"
        },
        isReady: {
            type: "boolean",
            description: "True if all required fields were clearly found in the cast"
        }
    },
    required: ["title", "editionSize", "mintPrice", "isReady"],
    additionalProperties: false,
} as const;

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface GeminiGenerateContentResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
            }>;
        };
    }>;
    error?: {
        message?: string;
    };
}

function buildDropIntentPrompt(castText: string): string {
    return [
        "Extract Droppit deploy intent from this Farcaster cast.",
        "Return JSON only.",
        "Rules:",
        "- title: required string if the drop name is clearly present.",
        "- editionSize: required integer if clearly present.",
        "- mintPrice: required string in ETH units. Use \"0\" for free.",
        "- assetUri: optional source media URI if explicitly present in text.",
        "- isReady: true only when title, editionSize, and mintPrice are all clearly present.",
        `Cast: ${castText}`,
    ].join("\n");
}

async function invokeGeminiStructuredPrompt(castText: string) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");

    const response = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
            contents: [
                {
                    role: "user",
                    parts: [{ text: buildDropIntentPrompt(castText) }],
                },
            ],
            generationConfig: {
                responseMimeType: "application/json",
                responseJsonSchema: DROP_INTENT_JSON_SCHEMA,
                temperature: 0.1,
            },
        }),
    });

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    if (!response.ok) {
        throw new Error(payload.error?.message || `Gemini generateContent failed with HTTP ${response.status}`);
    }

    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) {
        throw new Error("Gemini generateContent returned no structured text response.");
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("Gemini generateContent returned invalid JSON.");
    }

    return DropIntentSchema.parse(parsed);
}

export async function initializeFarcasterParser() {
    return {
        structuredLlm: {
            invoke: invokeGeminiStructuredPrompt,
        },
    };
}
