import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateEvmAddress } from "@/lib/validation/drops";
import { createDraftRecord } from "@/lib/draft";

export async function POST(req: NextRequest) {
    try {
        const limited = await checkRateLimit(req, "createDraft", "[Draft Create]");
        if (limited) return limited;

        const body = await req.json();

        // Validate creator address early for wallet-scoped rate limiting
        const addressCheck = validateEvmAddress(body.creatorAddress, "creatorAddress");
        if (!addressCheck.valid) return NextResponse.json({ error: addressCheck.error }, { status: 400 });

        const walletScopedLimited = await checkRateLimit(
            req,
            "createDraft",
            "[Draft Create]",
            { identityParts: ["wallet", addressCheck.value] }
        );
        if (walletScopedLimited) return walletScopedLimited;

        // Delegate to shared draft-creation helper (Item 33)
        const result = await createDraftRecord({
            creatorAddress: body.creatorAddress,
            title: body.title,
            description: body.description,
            editionSize: body.editionSize,
            mintPrice: body.mintPriceWei,
            imageUrl: body.imageUrl,
            tokenUri: body.tokenUri,
            payoutRecipient: body.payoutRecipient,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ success: true, dropId: result.id }, { status: 201 });

    } catch (error) {
        console.error("[Drops API] Failed to create drop draft:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

