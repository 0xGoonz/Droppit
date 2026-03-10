import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { classifyRef, extractReferralPayloadFromBody, normalizeOptionalString } from '@/lib/attribution';
import crypto from 'crypto';
import { isAddress } from 'viem';

/**
 * Generates a stable anonymous session fingerprint.
 *
 * SHA-256(IP + "|" + User-Agent + "|" + YYYY-MM-DD)
 *
 * - Not PII: the hash is irreversible and cannot recover the IP or UA.
 * - Rotates daily: the date component acts as a built-in salt rotation
 *   so the same visitor produces a different session_id each day,
 *   limiting long-term tracking.
 * - Covers anonymous visitors: unlike wallet-based counting, this works
 *   for viewers who never connect a wallet.
 */
function generateSessionId(req: NextRequest): string {
    const ip = getClientIp(req);
    const ua = req.headers.get('user-agent') || '';
    const daySalt = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return crypto
        .createHash('sha256')
        .update(`${ip}|${ua}|${daySalt}`)
        .digest('hex');
}

export async function POST(req: NextRequest) {
    try {
        // Rate limit: analytics preset (120 reqs / 1 min)
        const limited = await checkRateLimit(req, "analytics", "[Attribution View]");
        if (limited) return limited;

        const body = await req.json();
        const bodyRecord = body && typeof body === "object" && !Array.isArray(body)
            ? (body as Record<string, unknown>)
            : {};

        const rawDropId = normalizeOptionalString(bodyRecord.dropId);
        const rawContractAddress = normalizeOptionalString(bodyRecord.contractAddress);
        const normalizedContractAddress = rawContractAddress?.toLowerCase() || null;
        const rawWallet = normalizeOptionalString(bodyRecord.wallet);
        const normalizedWallet = rawWallet?.toLowerCase() || null;
        const dedupeKey = normalizeOptionalString(bodyRecord.dedupeKey);
        const referralPayload = extractReferralPayloadFromBody(bodyRecord);

        if (!rawDropId && !normalizedContractAddress) {
            return NextResponse.json({ error: "Missing required fields: dropId or contractAddress must be provided" }, { status: 400 });
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

        if (dedupeKey) {
            let dedupeQuery = supabaseAdmin
                .from('analytics_events')
                .select('id')
                .eq('event', 'page_view')
                .contains('metadata', { dedupe_key: dedupeKey })
                .limit(1);

            if (resolvedDropId) {
                dedupeQuery = dedupeQuery.eq('drop_id', resolvedDropId);
            } else if (normalizedContractAddress) {
                dedupeQuery = dedupeQuery.eq('contract_address', normalizedContractAddress);
            }

            const { data: dedupeRows, error: dedupeError } = await dedupeQuery;
            if (!dedupeError && dedupeRows && dedupeRows.length > 0) {
                return NextResponse.json({ success: true, deduped: true });
            }
        }

        // Generate stable anonymous session fingerprint
        const sessionId = generateSessionId(req);

        const metadata: Record<string, unknown> = {};
        if (dedupeKey) metadata.dedupe_key = dedupeKey;
        if (Object.keys(referralPayload.utm).length > 0) metadata.utm = referralPayload.utm;

        // Fire-and-forget log insertion for MVP analytics
        await supabaseAdmin.from('analytics_events').insert({
            event: 'page_view',
            drop_id: resolvedDropId,
            contract_address: normalizedContractAddress,
            ref: referralPayload.ref,
            ref_type: refType,
            ref_normalized: refNormalized,
            self_ref: selfRef,
            wallet: normalizedWallet,
            session_id: sessionId,
            metadata: Object.keys(metadata).length > 0 ? metadata : null,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Attribution log error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

