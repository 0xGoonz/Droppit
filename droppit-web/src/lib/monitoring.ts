/**
 * Structured operational monitoring for server-side events.
 *
 * Outputs JSON-formatted log lines suitable for log aggregation
 * (Datadog, Vercel Logs, CloudWatch, etc.).
 *
 * Categories:
 *   validation_failure  – input validation rejected
 *   publish_conflict    – publish status collision
 *   rate_limit_abuse    – repeated rate-limit hits from same identity
 *   encryption_error    – encryption/decryption failure
 *   auth_failure        – authentication/authorization rejected
 */

export type MonitoringCategory =
    | "validation_failure"
    | "publish_conflict"
    | "rate_limit_abuse"
    | "encryption_error"
    | "auth_failure";

export function logOperationalEvent(
    category: MonitoringCategory,
    event: string,
    meta?: Record<string, unknown>
): void {
    const entry = {
        level: "warn",
        category,
        event,
        ts: new Date().toISOString(),
        ...meta,
    };
    console.warn(`[MONITOR] ${JSON.stringify(entry)}`);
}
