import { getServiceRoleClient } from "@/lib/supabase";
import {
    validateTitle,
    validateEditionSize,
    validateMintPriceWei,
    validateEvmAddress,
} from "@/lib/validation/drops";

/**
 * Shared draft-creation helper used by both:
 *  - POST /api/drops        (web creator flow)
 *  - POST /api/webhooks/neynar (Farcaster agent flow)
 *
 * Ensures every draft passes the same validation rules regardless of entry point.
 */

export interface CreateDraftParams {
    /** Lowercase wallet address (web flow). Optional for webhook flow. */
    creatorAddress?: string;
    /** Farcaster FID (webhook flow). Optional for web flow. */
    creatorFid?: number;
    title: string;
    description?: string;
    editionSize: number | string;
    /** Wei string (e.g. "1000000000000000"). */
    mintPrice: string;
    castHash?: string;
    imageUrl?: string | null;
    tokenUri?: string | null;
    payoutRecipient?: string;
}

export type CreateDraftResult =
    | { success: true; id: string }
    | { success: false; error: string };

export async function createDraftRecord(
    params: CreateDraftParams
): Promise<CreateDraftResult> {
    // ── Validate ──────────────────────────────────────────────
    const titleCheck = validateTitle(params.title);
    if (!titleCheck.valid) return { success: false, error: titleCheck.error };

    const editionCheck = validateEditionSize(params.editionSize);
    if (!editionCheck.valid) return { success: false, error: editionCheck.error };

    const priceCheck = validateMintPriceWei(params.mintPrice);
    if (!priceCheck.valid) return { success: false, error: priceCheck.error };

    let normalizedCreator: string | undefined;
    if (params.creatorAddress) {
        const addressCheck = validateEvmAddress(params.creatorAddress, "creatorAddress");
        if (!addressCheck.valid) return { success: false, error: addressCheck.error };
        normalizedCreator = addressCheck.value; // already lowercased
    }

    let normalizedPayout: string | undefined;
    if (params.payoutRecipient && params.payoutRecipient.trim() !== "") {
        const payoutCheck = validateEvmAddress(params.payoutRecipient, "payoutRecipient");
        if (!payoutCheck.valid) return { success: false, error: payoutCheck.error };
        normalizedPayout = payoutCheck.value;
    }

    // ── Insert ────────────────────────────────────────────────
    const supabaseAdmin = getServiceRoleClient();

    const { data, error } = await supabaseAdmin
        .from("drops")
        .insert({
            creator_address: normalizedCreator || null,
            creator_fid: params.creatorFid || null,
            title: titleCheck.value,
            description: params.description || null,
            edition_size: editionCheck.value,
            mint_price: priceCheck.value,
            image_url: params.imageUrl || null,
            token_uri: params.tokenUri || null,
            payout_recipient: normalizedPayout || normalizedCreator || null,
            cast_hash: params.castHash || null,
            status: "DRAFT",
        })
        .select("id")
        .single();

    if (error) {
        console.error("[createDraftRecord] DB insert failed:", error);
        return { success: false, error: "Database error" };
    }

    return { success: true, id: data.id };
}
