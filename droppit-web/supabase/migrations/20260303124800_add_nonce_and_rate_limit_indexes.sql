-- Migration: Verify/Add Indexes for Nonces and Rate Limits
-- Description: Ensures optimal query planning for high-frequency RPCs and strict nonce consumption conditions.

-- 1. Nonce Consumption Coverage
-- The `consumeNonceOnce` function executes an UPDATE with a strict WHERE clause:
-- WHERE nonce = [nonce] AND wallet = [wallet] AND action = [action] AND drop_contract = [drop_contract] AND chain_id = [chain_id] AND used = false
-- While `nonce` is UNIQUE, adding a composite index containing all these fields allows PostgreSQL
-- to satisfy the locking and predicate matching without fetching the heap (Index-Only Scans).
CREATE INDEX IF NOT EXISTS idx_nonces_consume_strict 
ON public.nonces(nonce, wallet, action, drop_contract, chain_id, used);

-- 2. Nonce Invalidation Coverage
-- When generating a new nonce, the system invalidates old ones using:
-- UPDATE nonces SET used = true WHERE wallet = [wallet] AND action = [action] AND drop_contract = [drop_contract] AND chain_id = [chain_id] AND used = false
-- This index directly supports that bulk invalidation query.
CREATE INDEX IF NOT EXISTS idx_nonces_invalidation 
ON public.nonces(wallet, action, drop_contract, chain_id, used);

-- 3. Nonce Expiration 
-- Used when looking up nonces to ensure they haven't expired, or for background cleanup workers
-- that may do `DELETE FROM nonces WHERE expires_at < now()`.
CREATE INDEX IF NOT EXISTS idx_nonces_expiration 
ON public.nonces(expires_at);

-- 4. Rate-Limit RPC 
-- The `check_and_increment_rate_limit` RPC heavily queries `ip_address` and `last_reset`.
-- `ip_address` is the PRIMARY KEY (so it has an implicit unique B-Tree index).
-- We add an index on `last_reset` to accelerate timeline evaluations and eventual cleanup 
-- pruning of the rate limits table.
CREATE INDEX IF NOT EXISTS idx_rate_limits_last_reset 
ON public.rate_limits(last_reset);
