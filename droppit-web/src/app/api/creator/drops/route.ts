import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getServiceRoleClient } from "@/lib/supabase";

/**
 * GET /api/creator/drops?wallet=0x...
 *
 * Returns creator-owned drops ordered by newest first.
 * This powers the Creator Hub listing UI.
 */
export async function GET(req: NextRequest) {
    try {
        const wallet = req.nextUrl.searchParams.get("wallet")?.toLowerCase();

        if (!wallet || !isAddress(wallet)) {
            return NextResponse.json({ error: "Missing or invalid wallet parameter." }, { status: 400 });
        }

        const supabaseAdmin = getServiceRoleClient();
        const { data, error } = await supabaseAdmin
            .from("drops")
            .select("id, title, status, contract_address, created_at, edition_size, mint_price")
            .eq("creator_address", wallet)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[Creator Drops API] Error:", error);
            return NextResponse.json({ error: "Failed to fetch creator drops." }, { status: 500 });
        }

        return NextResponse.json({ drops: data || [] });
    } catch (error) {
        console.error("[Creator Drops API] Unexpected error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
