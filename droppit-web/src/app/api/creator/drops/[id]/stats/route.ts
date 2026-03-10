import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

/**
 * Temporary backward-compat route.
 * Resolves drop ID -> contract address, then redirects to canonical stats API.
 */
export async function POST(
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
        const { data: drop, error } = await supabaseAdmin
            .from("drops")
            .select("contract_address")
            .eq("id", dropId)
            .single();

        if (error || !drop || !drop.contract_address) {
            return NextResponse.json({ error: "Drop not found" }, { status: 404 });
        }

        const redirectUrl = new URL(`/api/stats/${drop.contract_address}`, req.url);
        return NextResponse.redirect(redirectUrl, 307);
    } catch (error) {
        console.error("[Legacy Creator Stats API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
