import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export const revalidate = 300; // Cache for 5 minutes

export async function GET() {
    try {
        const supabaseAdmin = getServiceRoleClient();

        // 1) Count live drops & distinct creators
        const { data: dropsData, error: dropsError } = await supabaseAdmin
            .from("drops")
            .select("creator_address")
            .eq("status", "LIVE");

        if (dropsError) {
            console.error("[Public Stats API] drops query error:", dropsError);
            throw dropsError;
        }

        const liveDropsCount = dropsData ? dropsData.length : 0;
        
        const creators = new Set<string>();
        if (dropsData) {
            dropsData.forEach(d => {
                if (d.creator_address) creators.add(d.creator_address.toLowerCase());
            });
        }
        const distinctCreatorsCount = creators.size;

        // 2) Sum total NFTs minted globally
        const { data: mintsData, error: mintsError } = await supabaseAdmin
            .from("analytics_events")
            .select("quantity")
            .eq("event", "mint_success");

        if (mintsError) {
            console.error("[Public Stats API] analytics query error:", mintsError);
            throw mintsError;
        }

        let totalMinted = 0;
        if (mintsData) {
            totalMinted = mintsData.reduce((sum, row) => sum + (row.quantity || 0), 0);
        }

        // Return aggregated stats
        return NextResponse.json(
            {
                dropsLaunched: liveDropsCount,
                nftsMinted: totalMinted,
                creators: distinctCreatorsCount
            },
            {
                status: 200,
                headers: {
                    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
                },
            }
        );
    } catch (error) {
        console.error("[Public Stats API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
