import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const dropId = resolvedParams.id;

        if (!dropId) {
            return NextResponse.json({ error: "Missing drop ID" }, { status: 400 });
        }

        const supabaseAdmin = getServiceRoleClient();

        const { data, error } = await supabaseAdmin
            .from('drops')
            .select('id, title, description, edition_size, mint_price, payout_recipient, image_url, token_uri, locked_content_draft, status')
            .eq('id', dropId)
            .single();

        if (error) {
            console.error("[Drops API GET] Database error:", error);
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: "Drop not found" }, { status: 404 });
            }
            return NextResponse.json({ error: "Failed to fetch drop" }, { status: 500 });
        }

        // ── Lifecycle Guards ───────────────────────────────────────
        // LIVE/PUBLISHED drops should not be re-deployed via the create page
        if (data.status === 'LIVE' || data.status === 'PUBLISHED') {
            return NextResponse.json(
                { error: "This drop has already been published and cannot be re-deployed." },
                { status: 409 }
            );
        }

        // Any status that is not DRAFT is unexpected for the create flow
        if (data.status !== 'DRAFT') {
            return NextResponse.json(
                { error: `Drop is in an invalid state for editing: ${data.status}` },
                { status: 400 }
            );
        }

        // ── Return all fields the create page needs for hydration ──
        return NextResponse.json({
            title: data.title || "",
            description: data.description || "",
            editionSize: data.edition_size?.toString() || "100",
            mintPriceWei: data.mint_price ? data.mint_price.toString() : "0",
            payoutRecipient: data.payout_recipient || "",
            lockedContent: data.locked_content_draft || "",
            imageUrl: data.image_url || null,
            tokenUri: data.token_uri || null,
            status: data.status,
        }, { status: 200 });

    } catch (error) {
        console.error("[Drops API GET] Error processing request:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
