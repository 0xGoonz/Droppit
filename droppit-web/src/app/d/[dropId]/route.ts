import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ dropId: string }> }
) {
    try {
        const resolvedParams = await params;
        const dropId = resolvedParams.dropId;
        const searchParams = req.nextUrl.searchParams;
        const ref = searchParams.get("ref");

        const supabaseAdmin = getServiceRoleClient();

        const { data, error } = await supabaseAdmin
            .from('drops')
            .select('contract_address, status')
            .eq('id', dropId)
            .single();

        if (error || !data) {
            return new NextResponse("Drop not found", { status: 404 });
        }

        if (data.status !== 'LIVE' || !data.contract_address) {
            // Non-live drops should land on draft-aware create flow.
            const draftUrl = new URL(`/create`, req.url);
            draftUrl.searchParams.set("draftId", dropId);
            if (ref) {
                draftUrl.searchParams.set("ref", ref);
            }
            return NextResponse.redirect(draftUrl);
        }

        const canonicalUrl = new URL(`/drop/base/${data.contract_address}`, req.url);
        if (ref) {
            canonicalUrl.searchParams.set("ref", ref);
        }

        return NextResponse.redirect(canonicalUrl, 301);

    } catch (e: any) {
        console.error("Short link redirect error:", e);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
