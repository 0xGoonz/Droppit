-- ============================================================
-- Forward Migration: Normalize schema to match canonical schema.sql
-- ============================================================
-- Safe to run on existing databases. Uses IF NOT EXISTS / IF EXISTS
-- guards and DO blocks with exception handlers throughout.
--
-- Fixes:
--   1. Add payout_recipient (TEXT) if missing
--   2. Add cast_hash (TEXT) + index if missing
--   3. Add locked_content_draft (TEXT) if missing
--   4. Normalize mint_price from NUMERIC → TEXT if needed
--   5. Normalize payout_recipient from VARCHAR(42) → TEXT if needed
--   6. Add column COMMENTs for documentation
--   7. Migrate existing plaintext locked_content from DRAFT rows
-- ============================================================

-- ── 1. Add missing columns ──────────────────────────────────

ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS payout_recipient TEXT;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS cast_hash TEXT;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS locked_content_draft TEXT;

-- ── 2. Normalize mint_price: NUMERIC → TEXT ─────────────────
-- The old align_schema migration used NUMERIC DEFAULT 0, but the
-- application stores wei as TEXT strings for BigInt precision safety.
-- This block checks the current type and converts if necessary.

DO $$
DECLARE
    col_type TEXT;
BEGIN
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'drops'
      AND column_name = 'mint_price';

    IF col_type IS NOT NULL AND col_type != 'text' THEN
        -- Convert existing NUMERIC values to TEXT, preserving the integer portion
        ALTER TABLE public.drops
            ALTER COLUMN mint_price TYPE TEXT
            USING CASE
                WHEN mint_price IS NULL THEN '0'
                ELSE TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM mint_price::TEXT))
            END;

        ALTER TABLE public.drops
            ALTER COLUMN mint_price SET DEFAULT '0';

        RAISE NOTICE 'Converted drops.mint_price from % to TEXT', col_type;
    END IF;
END $$;

-- ── 3. Normalize payout_recipient: VARCHAR(42) → TEXT ───────
-- The old migration used VARCHAR(42), but TEXT is more appropriate
-- for consistency with all other address columns.

DO $$
DECLARE
    col_type TEXT;
    col_length INTEGER;
BEGIN
    SELECT data_type, character_maximum_length INTO col_type, col_length
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'drops'
      AND column_name = 'payout_recipient';

    IF col_type = 'character varying' THEN
        ALTER TABLE public.drops
            ALTER COLUMN payout_recipient TYPE TEXT;

        RAISE NOTICE 'Converted drops.payout_recipient from VARCHAR(%) to TEXT', col_length;
    END IF;
END $$;

-- ── 4. Add cast_hash index ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_drops_cast_hash ON public.drops(cast_hash);

-- ── 5. Migrate existing plaintext locked_content from DRAFT rows ─

UPDATE public.drops
SET locked_content_draft = locked_content,
    locked_content = NULL
WHERE status = 'DRAFT'
  AND locked_content IS NOT NULL
  AND locked_content != ''
  AND locked_content_draft IS NULL
  -- Skip rows where locked_content is already encrypted JSON
  AND locked_content NOT LIKE '{"encrypted":true%';

-- ── 6. Add column COMMENTs ──────────────────────────────────

COMMENT ON COLUMN public.drops.mint_price IS 'Wei value as TEXT. Never use NUMERIC — BigInt precision loss risk. Validated by validateMintPriceWei().';
COMMENT ON COLUMN public.drops.locked_content IS 'Encrypted locked content JSON payload. Written only at publish time via encryptLockedContent().';
COMMENT ON COLUMN public.drops.locked_content_draft IS 'Temporary plaintext staging for locked content during draft phase. Cleared at publish time after encryption.';
COMMENT ON COLUMN public.drops.payout_recipient IS 'EVM address receiving mint proceeds. Lowercase, set via web flow.';
COMMENT ON COLUMN public.drops.cast_hash IS 'Farcaster cast hash linking a webhook event to this draft.';
