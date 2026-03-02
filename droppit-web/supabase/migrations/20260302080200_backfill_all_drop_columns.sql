-- ============================================================
-- Forward Migration: Complete schema alignment for drops table
-- ============================================================
-- Timestamp: 20260302080200
--
-- This migration ensures ALL columns written by application code
-- exist with the correct types, regardless of which prior
-- migrations have already been applied.
--
-- Safe to run on any state:
--   - Fresh databases (schema.sql already has everything)
--   - Old databases that ran the NUMERIC mint_price migration
--   - Databases missing payout_recipient, cast_hash, etc.
-- ============================================================

-- ── 1. Add all missing columns (idempotent) ─────────────────

ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS creator_address TEXT;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS creator_fid BIGINT;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS edition_size INTEGER;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS mint_price TEXT DEFAULT '0';
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS token_uri TEXT;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS payout_recipient TEXT;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS locked_content TEXT;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS locked_content_draft TEXT;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS cast_hash TEXT;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'DRAFT';
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS contract_address TEXT;
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS tx_hash_deploy TEXT;

-- ── 2. Normalize mint_price: NUMERIC/other → TEXT ───────────
-- Prior migrations may have created this as NUMERIC DEFAULT 0.
-- The application stores wei values as TEXT strings to avoid
-- IEEE 754 float drift and BigInt precision loss.

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
        -- Convert existing values to TEXT, stripping trailing zeros/dots
        -- from NUMERIC representations (e.g. "0.00" → "0", "100.0" → "100")
        ALTER TABLE public.drops
            ALTER COLUMN mint_price TYPE TEXT
            USING CASE
                WHEN mint_price IS NULL THEN '0'
                ELSE TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM mint_price::TEXT))
            END;

        ALTER TABLE public.drops
            ALTER COLUMN mint_price SET DEFAULT '0';

        RAISE NOTICE '[migration] Converted drops.mint_price from % to TEXT', col_type;
    END IF;
END $$;

-- ── 3. Normalize payout_recipient: VARCHAR(42) → TEXT ───────
-- An old migration used VARCHAR(42). TEXT is more consistent with
-- all other address columns and avoids truncation edge cases.

DO $$
DECLARE
    col_type TEXT;
BEGIN
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'drops'
      AND column_name = 'payout_recipient';

    IF col_type = 'character varying' THEN
        ALTER TABLE public.drops
            ALTER COLUMN payout_recipient TYPE TEXT;

        RAISE NOTICE '[migration] Converted drops.payout_recipient from VARCHAR to TEXT';
    END IF;
END $$;

-- ── 4. Ensure nullable constraints are correct ──────────────
-- creator_address must be nullable (webhook flow uses creator_fid)
-- contract_address must be nullable (DRAFTs don't have one)

DO $$ BEGIN
    ALTER TABLE public.drops ALTER COLUMN creator_address DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.drops ALTER COLUMN contract_address DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 5. Migrate plaintext locked_content from DRAFT rows ─────
-- If any DRAFT rows have plaintext in locked_content (from code
-- that predates the staging column), move it to locked_content_draft
-- and clear the original. Skip already-encrypted rows.

UPDATE public.drops
SET locked_content_draft = locked_content,
    locked_content = NULL
WHERE status = 'DRAFT'
  AND locked_content IS NOT NULL
  AND locked_content != ''
  AND locked_content_draft IS NULL
  AND locked_content NOT LIKE '{"encrypted":true%';

-- ── 6. Ensure indexes exist ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_drops_contract_address ON public.drops(contract_address);
CREATE INDEX IF NOT EXISTS idx_drops_status ON public.drops(status);
CREATE INDEX IF NOT EXISTS idx_drops_cast_hash ON public.drops(cast_hash);

-- ── 7. Column documentation ────────────────────────────────

COMMENT ON COLUMN public.drops.mint_price IS 'Wei value as TEXT string. Never use NUMERIC — BigInt precision loss risk. Validated by validateMintPriceWei(). Normalized from ETH by normalizeEthToWei().';
COMMENT ON COLUMN public.drops.locked_content IS 'Encrypted locked content JSON payload. Written only at publish time via encryptLockedContent(). Never plaintext.';
COMMENT ON COLUMN public.drops.locked_content_draft IS 'Temporary plaintext staging for locked content during draft phase. Cleared to NULL at publish time after encryption.';
COMMENT ON COLUMN public.drops.payout_recipient IS 'EVM address receiving mint proceeds. Lowercase, set via web flow or defaulting to creator_address.';
COMMENT ON COLUMN public.drops.cast_hash IS 'Farcaster cast hash linking a Neynar webhook event to this draft.';
COMMENT ON COLUMN public.drops.creator_fid IS 'Farcaster FID of the creator. Set via webhook flow when creator_address is not available.';
COMMENT ON COLUMN public.drops.tx_hash_deploy IS 'Transaction hash of the createDrop() call on Base. Set at publish time.';
