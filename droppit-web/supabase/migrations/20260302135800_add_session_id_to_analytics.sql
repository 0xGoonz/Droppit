-- ============================================================
-- Forward Migration: Add session_id to analytics_events
-- ============================================================
-- Timestamp: 20260302135800
--
-- Adds a stable anonymous session identifier to analytics_events
-- for accurate unique visitor counting without storing raw PII.
--
-- The session_id is a SHA-256 hash of (IP + User-Agent + daily salt)
-- computed server-side. It rotates daily to limit tracking scope.
-- ============================================================

-- ── 1. Add column (idempotent) ──────────────────────────────

ALTER TABLE public.analytics_events
    ADD COLUMN IF NOT EXISTS session_id TEXT;

-- ── 2. Index for fast distinct counting per drop ────────────

CREATE INDEX IF NOT EXISTS idx_analytics_session_drop
    ON public.analytics_events(drop_id, session_id)
    WHERE session_id IS NOT NULL;

-- ── 3. Documentation ────────────────────────────────────────

COMMENT ON COLUMN public.analytics_events.session_id IS
    'Anonymized session fingerprint: SHA-256(IP + User-Agent + daily-rotating salt). '
    'Not PII — cannot be reversed to recover IP or UA. Rotates daily.';
