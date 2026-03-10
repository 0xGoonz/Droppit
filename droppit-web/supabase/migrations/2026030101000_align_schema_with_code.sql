-- ============================================================
-- Forward Migration: Align existing Supabase tables with canonical schema
-- ============================================================
-- Safe to run on existing databases. Uses IF NOT EXISTS / IF EXISTS
-- guards throughout. Handles both fresh installs and old schemas.
-- ============================================================

-- ===================== drops =====================

-- Add columns that the code expects but old schema didn't have
DO $$ BEGIN
    -- Draft/lifecycle columns
    ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS title TEXT;
    ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS edition_size INTEGER;
    ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS mint_price TEXT DEFAULT '0';  -- Wei as TEXT (bigint-safe)
    ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS token_uri TEXT;
    ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'DRAFT';
    ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS tx_hash_deploy TEXT;
    ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS creator_fid BIGINT;
    ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS payout_recipient TEXT;
    ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS cast_hash TEXT;
    ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS locked_content_draft TEXT;

    -- Rename old naming if present
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'drops' AND column_name = 'encrypted_locked_content'
    ) THEN
        ALTER TABLE public.drops RENAME COLUMN encrypted_locked_content TO locked_content;
    ELSE
        ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS locked_content TEXT;
    END IF;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Drop legacy key_id column (no longer used — encryption is app-level)
ALTER TABLE public.drops DROP COLUMN IF EXISTS key_id;

-- The old schema had contract_address NOT NULL, but DRAFTs don't have one.
-- Remove the NOT NULL constraint safely.
DO $$ BEGIN
    ALTER TABLE public.drops ALTER COLUMN contract_address DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Make creator_address nullable (webhook flow uses creator_fid instead)
DO $$ BEGIN
    ALTER TABLE public.drops ALTER COLUMN creator_address DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_drops_status ON public.drops(status);
CREATE INDEX IF NOT EXISTS idx_drops_cast_hash ON public.drops(cast_hash);

-- ===================== analytics_events =====================

-- Fix naming drift: rename event_type → event if the old column exists
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_events' AND column_name = 'event_type'
    ) THEN
        ALTER TABLE public.analytics_events RENAME COLUMN event_type TO event;
    END IF;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Rename old timestamp column if it exists
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_events' AND column_name = 'timestamp'
    ) THEN
        ALTER TABLE public.analytics_events RENAME COLUMN timestamp TO created_at;
    END IF;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Rename old user_address → wallet if present
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_events' AND column_name = 'user_address'
    ) THEN
        ALTER TABLE public.analytics_events RENAME COLUMN user_address TO wallet;
    END IF;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add new attribution columns
DO $$ BEGIN
    ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS drop_id UUID;
    ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS ref TEXT;
    ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS ref_type TEXT;
    ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS ref_normalized TEXT;
    ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS self_ref BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS quantity INTEGER;
    ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS tx_hash TEXT;
    ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS wallet TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Update indexes
DROP INDEX IF EXISTS idx_analytics_contract_event;
CREATE INDEX IF NOT EXISTS idx_analytics_drop_event ON public.analytics_events(drop_id, event);
CREATE INDEX IF NOT EXISTS idx_analytics_contract ON public.analytics_events(contract_address);

-- ===================== nonces (new table) =====================

CREATE TABLE IF NOT EXISTS public.nonces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nonce TEXT NOT NULL UNIQUE,
    wallet TEXT NOT NULL,
    drop_id UUID,
    drop_contract TEXT,
    action TEXT NOT NULL,
    chain_id TEXT NOT NULL DEFAULT '84532',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nonces_wallet_action ON public.nonces(wallet, action, chain_id);
CREATE INDEX IF NOT EXISTS idx_nonces_drop_id ON public.nonces(drop_id);

-- Add chain_id to existing nonces table if it already exists
ALTER TABLE public.nonces ADD COLUMN IF NOT EXISTS chain_id TEXT NOT NULL DEFAULT '84532';
ALTER TABLE public.nonces ADD COLUMN IF NOT EXISTS drop_id UUID;

-- ===================== webhook_events (new table) =====================

CREATE TABLE IF NOT EXISTS public.webhook_events (
    event_id TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ===================== identity_links (new table) =====================

CREATE TABLE IF NOT EXISTS public.identity_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_address TEXT NOT NULL,
    handle TEXT NOT NULL,
    fid BIGINT,
    signature TEXT NOT NULL,
    nonce TEXT NOT NULL UNIQUE,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT identity_links_address_handle_unique UNIQUE (creator_address, handle)
);

CREATE INDEX IF NOT EXISTS idx_identity_links_address ON public.identity_links(creator_address);
