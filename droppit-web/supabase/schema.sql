-- ============================================================
-- Droppit — Canonical Schema (Source of Truth)
-- ============================================================
-- This file defines every table the application code expects.
-- Run this on a fresh Supabase project for local/CI setup.
-- For existing databases, apply forward migrations instead.
-- ============================================================

-- 1. drops — Core drop lifecycle (DRAFT → LIVE)
-- Used by: api/drops, api/drops/[id], api/drops/[id]/publish,
--          api/drop/locked, api/drops/by-address/[address],
--          api/og/drop/[dropIdOrAddress], api/og/draft/[draftId],
--          api/webhooks/neynar, api/frame/deploy/[castHash],
--          api/frame/draft/[draftId]/deploy,
--          api/creator/drops/[id]/stats
CREATE TABLE IF NOT EXISTS public.drops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Creator identity
    creator_address TEXT,              -- Wallet address (web flow, lowercase)
    creator_fid BIGINT,                -- Farcaster FID (webhook flow)
    -- Drop metadata
    title TEXT NOT NULL,
    description TEXT,
    edition_size INTEGER NOT NULL,
    mint_price TEXT DEFAULT '0',        -- Wei as TEXT string (bigint-safe, no float precision loss)
    image_url TEXT,                     -- IPFS gateway or pinned URL
    token_uri TEXT,                     -- ipfs://Qm... (set at upload time)
    -- Payout
    payout_recipient TEXT,             -- Wallet address to receive mint proceeds (lowercase)
    -- Locked content
    locked_content TEXT,               -- Encrypted JSON payload (written at publish time only)
    locked_content_draft TEXT,         -- Plaintext staging during draft phase (cleared at publish)
    deploy_salt TEXT,                  -- Staged 32-byte random salt for locked-content commitment during deploy
    deploy_commitment TEXT,            -- Staged keccak256(salt || locked_content_draft) used in tx build/finalize
    -- Webhook/Farcaster linkage
    cast_hash TEXT,                    -- Farcaster cast hash linking webhook → draft
    -- Deployment lifecycle
    status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT | LIVE
    contract_address TEXT UNIQUE,      -- Set at publish (lowercase)
    tx_hash_deploy TEXT,               -- Deploy transaction hash
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drops_contract_address ON public.drops(contract_address);
CREATE INDEX IF NOT EXISTS idx_drops_status ON public.drops(status);
CREATE INDEX IF NOT EXISTS idx_drops_cast_hash ON public.drops(cast_hash);

COMMENT ON COLUMN public.drops.mint_price IS 'Wei value as TEXT string. Never use NUMERIC — BigInt precision loss risk. Validated by validateMintPriceWei(). Normalized from ETH by normalizeEthToWei().';
COMMENT ON COLUMN public.drops.locked_content IS 'Encrypted locked content JSON payload. Written only at publish time via encryptLockedContent(). Never plaintext.';
COMMENT ON COLUMN public.drops.locked_content_draft IS 'Temporary plaintext staging for locked content during draft phase. Cleared to NULL at publish time after encryption.';
COMMENT ON COLUMN public.drops.deploy_salt IS 'Temporary random bytes32 salt generated at tx-build time for locked-content commitment. Cleared at publish.';
COMMENT ON COLUMN public.drops.deploy_commitment IS 'Temporary keccak256(bytes32 salt || locked_content_draft) staged for frame deploy consistency. Cleared at publish.';
COMMENT ON COLUMN public.drops.payout_recipient IS 'EVM address receiving mint proceeds. Lowercase, set via web flow or defaulting to creator_address.';
COMMENT ON COLUMN public.drops.cast_hash IS 'Farcaster cast hash linking a Neynar webhook event to this draft.';
COMMENT ON COLUMN public.drops.creator_fid IS 'Farcaster FID of the creator. Set via webhook flow when creator_address is not available.';
COMMENT ON COLUMN public.drops.tx_hash_deploy IS 'Transaction hash of the createDrop() call on Base. Set at publish time.';

-- 2. nonces — Challenge nonces for signature verification
-- Used by: api/drop/locked/nonce, api/drop/locked,
--          api/identity/link/nonce, api/identity/link/verify
CREATE TABLE IF NOT EXISTS public.nonces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nonce TEXT NOT NULL UNIQUE,
    wallet TEXT NOT NULL,               -- Lowercase wallet address
    drop_id UUID,                       -- For creator stats nonces (nullable)
    drop_contract TEXT,                 -- For locked-content nonces (nullable for identity nonces)
    action TEXT NOT NULL,               -- 'unlock' | 'identity_link' | 'stats_read'
    chain_id TEXT NOT NULL,             -- '8453' (Base) | '84532' (Base Sepolia)
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nonces_wallet_action ON public.nonces(wallet, action, chain_id);
CREATE INDEX IF NOT EXISTS idx_nonces_drop_id ON public.nonces(drop_id);
CREATE INDEX IF NOT EXISTS idx_nonces_used_expires_at ON public.nonces(used, expires_at);
CREATE INDEX IF NOT EXISTS idx_nonces_wallet ON public.nonces(wallet);
CREATE INDEX IF NOT EXISTS idx_nonces_action ON public.nonces(action);

-- 3. analytics_events — Attribution & analytics tracking
-- Used by: api/attribution/view, api/attribution/mint,
--          api/creator/drops/[id]/stats
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event TEXT NOT NULL,                -- 'page_view' | 'mint_success'
    drop_id UUID,                      -- References drops.id
    contract_address TEXT,
    wallet TEXT,                        -- Viewer/minter address
    session_id TEXT,                    -- SHA-256(IP+UA+daily salt) — anonymous, non-PII, rotates daily
    -- Referral attribution
    ref TEXT,                           -- Raw ref param value
    ref_type TEXT,                      -- 'address' | 'code' | 'none' | 'invalid'
    ref_normalized TEXT,                -- Lowercase normalized ref
    self_ref BOOLEAN DEFAULT FALSE,
    -- Mint-specific fields
    quantity INTEGER,
    tx_hash TEXT,
    -- Meta
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_drop_event ON public.analytics_events(drop_id, event);
CREATE INDEX IF NOT EXISTS idx_analytics_contract ON public.analytics_events(contract_address);
CREATE INDEX IF NOT EXISTS idx_analytics_session_drop ON public.analytics_events(drop_id, session_id) WHERE session_id IS NOT NULL;

COMMENT ON COLUMN public.analytics_events.session_id IS 'Anonymized session fingerprint: SHA-256(IP + User-Agent + daily-rotating salt). Not PII — cannot be reversed. Rotates daily.';

-- 4. identity_links — MVP wallet-to-handle proof
-- Used by: api/identity/link/verify, drop/base/[contractAddress]/page.tsx
CREATE TABLE IF NOT EXISTS public.identity_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_address TEXT NOT NULL,
    handle TEXT NOT NULL,
    fid BIGINT,                         -- Optional Farcaster FID
    signature TEXT NOT NULL,
    nonce TEXT NOT NULL UNIQUE,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT identity_links_address_handle_unique UNIQUE (creator_address, handle)
);

CREATE INDEX IF NOT EXISTS idx_identity_links_address ON public.identity_links(creator_address);

-- 5. webhook_events — Idempotency tracking for Farcaster webhooks
-- Used by: api/webhooks/neynar
CREATE TABLE IF NOT EXISTS public.webhook_events (
    event_id TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 6. rate_limits — IP-based rate limiting
CREATE TABLE IF NOT EXISTS public.rate_limits (
    ip_address TEXT PRIMARY KEY,
    points INTEGER DEFAULT 0 NOT NULL,
    last_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Rate limit helper function
CREATE OR REPLACE FUNCTION check_and_increment_rate_limit(
    client_ip TEXT,
    max_points INTEGER,
    reset_interval_minutes INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_points INTEGER;
    last_time TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT points, last_reset INTO current_points, last_time
    FROM public.rate_limits WHERE ip_address = client_ip;

    IF NOT FOUND THEN
        INSERT INTO public.rate_limits (ip_address, points, last_reset)
        VALUES (client_ip, 1, now());
        RETURN TRUE;
    END IF;

    IF now() > last_time + (reset_interval_minutes || ' minutes')::interval THEN
        UPDATE public.rate_limits
        SET points = 1, last_reset = now()
        WHERE ip_address = client_ip;
        RETURN TRUE;
    END IF;

    IF current_points >= max_points THEN
        RETURN FALSE;
    END IF;

    UPDATE public.rate_limits
    SET points = points + 1
    WHERE ip_address = client_ip;
    RETURN TRUE;
END;
$$;

-- 7. referral_links — Short-code referral redirects
-- Used by: app/r/[code]/route.ts
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

CREATE INDEX IF NOT EXISTS idx_referral_links_code ON public.referral_links(code);
CREATE INDEX IF NOT EXISTS idx_referral_links_contract_address ON public.referral_links(contract_address);

COMMENT ON TABLE  public.referral_links IS 'Short-code referral links that redirect to a drop page with attribution. Resolved by /r/[code] route.';
COMMENT ON COLUMN public.referral_links.code IS 'Alphanumeric referral code (plus _ and -). 1–64 chars. Validated by CHECK and by the route regex /^[A-Za-z0-9_-]{1,64}$/.';
COMMENT ON COLUMN public.referral_links.contract_address IS 'Lowercase EVM contract address of the linked drop. Must match a drops.contract_address row.';
COMMENT ON COLUMN public.referral_links.creator_address IS 'Optional lowercase EVM address of the referral link creator (for attribution/payouts).';
