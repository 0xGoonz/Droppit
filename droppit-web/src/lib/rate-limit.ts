import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { logOperationalEvent } from "@/lib/monitoring";

/**
 * Rate-limit presets per route category.
 * Each defines max points and reset window (minutes).
 */
export const RATE_LIMITS = {
    // Nonce endpoints: moderate limit to prevent challenge flooding
    nonce: { maxPoints: 20, windowMinutes: 5 },
    // Analytics endpoints: generous for client-side fire-and-forget
    analytics: { maxPoints: 120, windowMinutes: 1 },
    // Webhook endpoints: allow bursts but cap sustained abuse
    webhook: { maxPoints: 60, windowMinutes: 5 },
    // Draft create endpoint: 100 per day (wallet-scoped)
    createDraft: { maxPoints: 100, windowMinutes: 1440 },
    // Draft publish endpoint: 30 per hour (wallet-scoped)
    publish: { maxPoints: 30, windowMinutes: 60 },
    // Unlock reveal endpoint: 10 per hour (wallet + drop scoped)
    unlockReveal: { maxPoints: 10, windowMinutes: 60 },
    // OG render endpoint: 60 per minute (IP scoped)
    ogRender: { maxPoints: 60, windowMinutes: 1 },
    // Referral generation endpoint: 30 per hour (wallet scoped)
    generateReferral: { maxPoints: 30, windowMinutes: 60 },
} as const;

export type RateLimitPreset = keyof typeof RATE_LIMITS;
type RateLimitIdentityPart = string | number | null | undefined;

type CheckRateLimitOptions = {
    /**
     * Optional identity dimensions (wallet, drop id, tx hash, etc.) to avoid
     * relying only on IP-level throttling.
     */
    identityParts?: RateLimitIdentityPart[];
};

/**
 * Extract the client IP from a Next.js request.
 * Checks x-forwarded-for (proxy), x-real-ip, then falls back to "unknown".
 */
export function getClientIp(req: NextRequest): string {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
        // x-forwarded-for may be a comma-separated list; take the first value.
        return forwarded.split(",")[0].trim();
    }
    return req.headers.get("x-real-ip") || "unknown";
}

function normalizeIdentityPart(value: RateLimitIdentityPart): string | null {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const sanitized = raw.toLowerCase().replace(/[^a-z0-9:_\-.]/g, "_");
    if (!sanitized) return null;
    return sanitized.slice(0, 80);
}

function buildRateLimitKey(
    req: NextRequest,
    preset: RateLimitPreset,
    options?: CheckRateLimitOptions
): string {
    const clientIp = getClientIp(req);
    const identityKey = (options?.identityParts || [])
        .map(normalizeIdentityPart)
        .filter((part): part is string => !!part)
        .join("|");

    // Include preset so separate route classes do not share one counter.
    const baseKey = `${preset}|ip:${clientIp}`;
    return identityKey ? `${baseKey}|id:${identityKey}` : baseKey;
}

function buildRateLimit429Response(
    preset: RateLimitPreset,
    windowMinutes: number
): NextResponse {
    const retryAfterSeconds = windowMinutes * 60;
    return NextResponse.json(
        {
            error: "rate_limited",
            code: "RATE_LIMITED",
            message: `Rate limit exceeded for ${preset}. Retry in ${retryAfterSeconds} seconds.`,
            retryAfterSeconds,
            preset,
        },
        {
            status: 429,
            headers: {
                "Retry-After": String(retryAfterSeconds),
            },
        }
    );
}

/**
 * Enforce rate limiting using the Postgres check_and_increment_rate_limit RPC.
 *
 * Returns null if within limits, otherwise returns a 429 NextResponse.
 */
export async function checkRateLimit(
    req: NextRequest,
    preset: RateLimitPreset,
    label = "[RateLimit]",
    options?: CheckRateLimitOptions
): Promise<NextResponse | null> {
    const { maxPoints, windowMinutes } = RATE_LIMITS[preset];
    const bucketKey = buildRateLimitKey(req, preset, options);

    try {
        const supabase = getServiceRoleClient();

        const { data, error } = await supabase.rpc("check_and_increment_rate_limit", {
            client_ip: bucketKey,
            max_points: maxPoints,
            reset_interval_minutes: windowMinutes,
        });

        if (error) {
            // Fail-open if rate limit storage is unavailable.
            console.warn(`${label} Rate limit RPC error (allowing request):`, error.message);
            return null;
        }

        if (data === false) {
            console.warn(`${label} Rate limit exceeded for ${bucketKey}`);
            // Item 53: Structured abuse detection logging
            logOperationalEvent("rate_limit_abuse", "limit_exceeded", {
                preset,
                bucketKey,
                maxPoints,
                windowMinutes,
                ip: getClientIp(req),
            });
            return buildRateLimit429Response(preset, windowMinutes);
        }

        return null;
    } catch (e: unknown) {
        // Unexpected error - fail-open to avoid blocking legitimate traffic.
        console.error(`${label} Rate limit check failed (allowing request):`, e);
        return null;
    }
}
