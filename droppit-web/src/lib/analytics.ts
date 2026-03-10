/**
 * Client-side analytics tracker.
 *
 * Fire-and-forget POST to the attribution endpoints.
 * – View events  → POST /api/attribution/view
 * – Mint events  → POST /api/attribution/mint
 * – All others   → POST /api/attribution/view (generic bucket)
 *
 * Follows the event catalogue in product-spec.md §18.
 */

const MINT_EVENTS = new Set([
    "mint_click",
    "mint_tx_submitted",
    "mint_success",
]);

export function trackEvent(
    event: string,
    params?: Record<string, unknown>
): void {
    try {
        const endpoint = MINT_EVENTS.has(event)
            ? "/api/attribution/mint"
            : "/api/attribution/view";

        const body = {
            event,
            ...params,
            timestamp: new Date().toISOString(),
        };

        // Navigator.sendBeacon for page-unload safety, fetch fallback
        const blob = new Blob([JSON.stringify(body)], {
            type: "application/json",
        });

        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
            navigator.sendBeacon(endpoint, blob);
        } else {
            fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                keepalive: true,
            }).catch(() => {
                /* fire-and-forget */
            });
        }
    } catch {
        // Analytics must never break the app
    }
}
