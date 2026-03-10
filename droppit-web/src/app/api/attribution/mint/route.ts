import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { classifyRef, extractReferralPayloadFromBody, normalizeOptionalString } from '@/lib/attribution';
import { isAddress } from 'viem';

export async function POST(req: NextRequest) {
    try {
        // Rate limit: analytics preset (120 reqs / 1 min)
        const limited = await checkRateLimit(req, "analytics", "[Attribution Mint]");
        if (limited) return limited;

        const body = await req.json();
        const bodyRecord = body && typeof body === "object" && !Array.isArray(body)
            ? (body as Record<string, unknown>)
            : {};

        const rawDropId = normalizeOptionalString(bodyRecord.dropId);
        const rawContractAddress = normalizeOptionalString(bodyRecord.contractAddress);
        const normalizedContractAddress = rawContractAddress?.toLowerCase() || null;
        const rawTxHash = normalizeOptionalString(bodyRecord.txHash);
        const normalizedTxHash = rawTxHash?.toLowerCase() || null;
        const rawWallet = normalizeOptionalString(bodyRecord.wallet);
        const normalizedWallet = rawWallet?.toLowerCase() || null;
        const rawQuantity = Number(bodyRecord.quantity);
        const dedupeKeyInput = normalizeOptionalString(bodyRecord.dedupeKey);
        const referralPayload = extractReferralPayloadFromBody(bodyRecord);

        if ((!rawDropId && !normalizedContractAddress) || !normalizedTxHash || !Number.isInteger(rawQuantity) || rawQuantity <= 0) {
            return NextResponse.json({ error: "Missing required fields or invalid quantity" }, { status: 400 });
        }
        if (rawDropId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawDropId)) {
            return NextResponse.json({ error: "Invalid dropId format (must be UUID)" }, { status: 400 });
        }
        if (normalizedContractAddress && !isAddress(normalizedContractAddress)) {
            return NextResponse.json({ error: "Invalid contractAddress format (must be EVM address)" }, { status: 400 });
        }
        if (normalizedWallet && !isAddress(normalizedWallet)) {
            return NextResponse.json({ error: "Invalid wallet format (must be EVM address)" }, { status: 400 });
        }
        if (!/^0x[a-fA-F0-9]{64}$/.test(normalizedTxHash)) {
            return NextResponse.json({ error: "Invalid txHash format (must be 66-character hex string starting with 0x)" }, { status: 400 });
        }

        const { refType, refNormalized } = classifyRef(referralPayload.ref);
        let selfRef = false;

        const supabaseAdmin = getServiceRoleClient();

        let resolvedDropId: string | null = rawDropId || null;
        let creatorAddress = null;
        if (resolvedDropId || normalizedContractAddress) {
            const query = supabaseAdmin.from('drops').select('id, creator_address');
            const { data } = normalizedContractAddress
                ? await query.eq('contract_address', normalizedContractAddress).maybeSingle()
                : await query.eq('id', resolvedDropId).maybeSingle();
            if (data?.id) resolvedDropId = data.id;
            creatorAddress = data?.creator_address?.toLowerCase() || null;
        }

        if (refType === "address") {
            const isWalletMatch = normalizedWallet && refNormalized === normalizedWallet;
            const isCreatorMatch = creatorAddress && refNormalized === creatorAddress;
            if (isWalletMatch || isCreatorMatch) {
                selfRef = true;
            }
        }

        const dropKeyForDedupe = resolvedDropId || normalizedContractAddress || "unknown-drop";
        const walletKeyForDedupe = normalizedWallet || "anonymous";
        const dedupeKey = dedupeKeyInput || `mint:${normalizedTxHash}:${walletKeyForDedupe}:${dropKeyForDedupe}`;

        let txDedupeQuery = supabaseAdmin
            .from('analytics_events')
            .select('id')
            .eq('event', 'mint_success')
            .eq('tx_hash', normalizedTxHash)
            .limit(1);

        if (resolvedDropId) {
            txDedupeQuery = txDedupeQuery.eq('drop_id', resolvedDropId);
        } else if (normalizedContractAddress) {
            txDedupeQuery = txDedupeQuery.eq('contract_address', normalizedContractAddress);
        }

        if (normalizedWallet) {
            txDedupeQuery = txDedupeQuery.eq('wallet', normalizedWallet);
        }

        const { data: txDuplicateRows, error: txDuplicateError } = await txDedupeQuery;
        if (!txDuplicateError && txDuplicateRows && txDuplicateRows.length > 0) {
            return NextResponse.json({ success: true, deduped: true });
        }

        let metadataDedupeQuery = supabaseAdmin
            .from('analytics_events')
            .select('id')
            .eq('event', 'mint_success')
            .contains('metadata', { dedupe_key: dedupeKey })
            .limit(1);

        if (resolvedDropId) {
            metadataDedupeQuery = metadataDedupeQuery.eq('drop_id', resolvedDropId);
        } else if (normalizedContractAddress) {
            metadataDedupeQuery = metadataDedupeQuery.eq('contract_address', normalizedContractAddress);
        }

        const { data: metadataDuplicateRows, error: metadataDuplicateError } = await metadataDedupeQuery;
        if (!metadataDuplicateError && metadataDuplicateRows && metadataDuplicateRows.length > 0) {
            return NextResponse.json({ success: true, deduped: true });
        }

        const metadata: Record<string, unknown> = {
            dedupe_key: dedupeKey,
        };
        if (Object.keys(referralPayload.utm).length > 0) metadata.utm = referralPayload.utm;

        await supabaseAdmin.from('analytics_events').insert({
            event: 'mint_success',
            drop_id: resolvedDropId,
            contract_address: normalizedContractAddress,
            ref: referralPayload.ref,
            ref_type: refType,
            ref_normalized: refNormalized,
            self_ref: selfRef,
            wallet: normalizedWallet,
            quantity: rawQuantity,
            tx_hash: normalizedTxHash,
            metadata,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Attribution mint log error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
