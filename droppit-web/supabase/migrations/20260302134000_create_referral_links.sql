-- ============================================================
-- Forward Migration: Create referral_links table
-- ============================================================
-- Timestamp: 20260302134000
--
-- Adds public.referral_links for short-code → drop resolution.
-- Used by: src/app/r/[code]/route.ts
--
-- The route validates codes with /^[A-Za-z0-9_-]{1,64}$/ and
-- redirects to /drop/base/<contract_address>?ref=<code>.
-- ============================================================

-- ── 1. Create table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referral_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Short referral code (unique, e.g. "alice-drop-01")
    code TEXT NOT NULL
        CONSTRAINT referral_links_code_unique UNIQUE
        CONSTRAINT referral_links_code_charset CHECK (
            code ~ '^[A-Za-z0-9_-]{1,64}$'
        ),

    -- On-chain drop contract this code points to (lowercase 0x address)
    contract_address TEXT NOT NULL
        CONSTRAINT referral_links_contract_lowercase CHECK (
            contract_address = LOWER(contract_address)
        ),

    -- Wallet that created this referral link (optional, lowercase 0x)
    creator_address TEXT
        CONSTRAINT referral_links_creator_lowercase CHECK (
            creator_address IS NULL OR creator_address = LOWER(creator_address)
        ),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ── 2. Indexes ──────────────────────────────────────────────

-- Fast lookup by code (unique index already created by UNIQUE constraint,
-- but an explicit index name keeps it consistent with the rest of the schema)
CREATE INDEX IF NOT EXISTS idx_referral_links_code
    ON public.referral_links(code);

-- Find all referral links for a given drop
CREATE INDEX IF NOT EXISTS idx_referral_links_contract_address
    ON public.referral_links(contract_address);

-- ── 3. Column documentation ────────────────────────────────

COMMENT ON TABLE  public.referral_links IS 'Short-code referral links that redirect to a drop page with attribution. Resolved by /r/[code] route.';
COMMENT ON COLUMN public.referral_links.code IS 'Alphanumeric referral code (plus _ and -). 1–64 chars. Validated by CHECK and by the route regex /^[A-Za-z0-9_-]{1,64}$/.';
COMMENT ON COLUMN public.referral_links.contract_address IS 'Lowercase EVM contract address of the linked drop. Must match a drops.contract_address row.';
COMMENT ON COLUMN public.referral_links.creator_address IS 'Optional lowercase EVM address of the referral link creator (for attribution/payouts).';
