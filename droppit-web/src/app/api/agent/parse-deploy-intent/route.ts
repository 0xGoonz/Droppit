import { NextRequest, NextResponse } from "next/server";
import { parseDeployIntent } from "@/lib/intent-parser";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const castText = body?.castText;

        if (!castText || typeof castText !== 'string') {
            return NextResponse.json({ error: "Missing or invalid castText in request body" }, { status: 400 });
        }

        const parsed = await parseDeployIntent(castText);

        if (!parsed.success) {
            return NextResponse.json({
                success: false,
                error: parsed.error,
                remediation: buildRemediationText(parsed.error),
            }, { status: 400 });
        }

        return NextResponse.json(parsed);
    } catch (e: any) {
        console.error("Agent Parse Error:", e);
        return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
    }
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Maps parser validation errors to user-friendly remediation guidance.
 * Helps callers display actionable next steps instead of raw validation text.
 */
function buildRemediationText(error: string | undefined): string {
    if (!error) return "Please include a title, edition size (1–10,000), and mint price in your cast.";

    if (error.includes("editionSize")) {
        return "Edition size must be a whole number between 1 and 10,000. Example: \"100 editions\" or \"edition size: 50\".";
    }
    if (error.includes("mintPrice")) {
        return "Mint price must be a non-negative number. Example: \"0.001 ETH\" or \"free\". Decimals and scientific notation in wei are not accepted.";
    }
    if (error.includes("title")) {
        return "A drop title is required and must be 200 characters or fewer. Example: \"My Genesis Drop\".";
    }
    if (error.includes("enough context")) {
        return "Your cast needs at least a title, edition size, and price. Try: \"@droppit My Drop, 100 editions, 0.001 ETH\".";
    }

    return `Please fix the following issue and try again: ${error}`;
}
