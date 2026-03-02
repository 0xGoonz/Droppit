import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { isAddress } from "viem";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ address: string }> }
) {
    try {
        const resolvedParams = await params;
        const rawAddress = resolvedParams.address;

        if (!rawAddress || !isAddress(rawAddress)) {
            return NextResponse.json({ error: "Invalid contract address format" }, { status: 400 });
        }

        const cleanAddress = rawAddress.toLowerCase();

        const supabaseAdmin = getServiceRoleClient();

        // Lookup drop strictly by the canonical deployed address and ensure it is live
        const { data, error } = await supabaseAdmin
            .from('drops')
            .select('*')
            .eq('contract_address', cleanAddress)
            .eq('status', 'LIVE')
            .single();

        if (error || !data) {
            // 404 is correct for drops that don't exist yet or aren't full published
            return NextResponse.json({ error: "Drop not found or not live" }, { status: 404 });
        }

        return NextResponse.json({ success: true, drop: data });

    } catch (error) {
        console.error("[Drops API] Failed to lookup drop by address:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
