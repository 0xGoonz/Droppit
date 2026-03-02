import { notFound, redirect } from "next/navigation";
import { getServiceRoleClient } from "@/lib/supabase";

/**
 * Temporary backward-compat page route.
 * Resolves drop ID -> contract address, then redirects to canonical stats page.
 */
export default async function LegacyCreatorStatsPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
    const dropId = resolvedParams.id;

    if (!dropId) {
        notFound();
    }

    const supabaseAdmin = getServiceRoleClient();
    const { data: drop, error } = await supabaseAdmin
        .from("drops")
        .select("contract_address")
        .eq("id", dropId)
        .single();

    if (error || !drop || !drop.contract_address) {
        notFound();
    }

    redirect(`/drop/base/${drop.contract_address}/stats`);
}
