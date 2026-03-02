import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ code: string }> }
) {
    try {
        const resolvedParams = await params;
        const code = resolvedParams.code;

        if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
            return new NextResponse("Invalid referral code", { status: 400 });
        }

        const supabaseAdmin = getServiceRoleClient();

        // Lookup canonical drop from referral mappings (Assuming this table exists per MVP architecture)
        const { data: refData, error: refError } = await supabaseAdmin
            .from('referral_links')
            .select('contract_address')
            .eq('code', code)
            .single();

        if (refError || !refData) {
            return new NextResponse("Referral link not found", { status: 404 });
        }

        if (!refData.contract_address) {
            return NextResponse.redirect(new URL(`/`, req.url));
        }

        const canonicalUrl = new URL(`/drop/base/${refData.contract_address}`, req.url);
        canonicalUrl.searchParams.set("ref", code);

        return NextResponse.redirect(canonicalUrl, 301);

    } catch (e: any) {
        console.error("Referral link redirect error:", e);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
