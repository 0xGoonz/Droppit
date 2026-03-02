-- Harden nonce consume query performance and replay protection support.
-- `nonce` uniqueness is already enforced by table definition (`nonce TEXT NOT NULL UNIQUE`).

CREATE INDEX IF NOT EXISTS idx_nonces_used_expires_at
    ON public.nonces(used, expires_at);

CREATE INDEX IF NOT EXISTS idx_nonces_wallet
    ON public.nonces(wallet);

CREATE INDEX IF NOT EXISTS idx_nonces_action
    ON public.nonces(action);
