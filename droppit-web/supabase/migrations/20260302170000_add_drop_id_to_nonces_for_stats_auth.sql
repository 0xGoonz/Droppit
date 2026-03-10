-- Add drop_id binding support for stats auth nonces
ALTER TABLE public.nonces
    ADD COLUMN IF NOT EXISTS drop_id UUID;

CREATE INDEX IF NOT EXISTS idx_nonces_drop_id
    ON public.nonces(drop_id);
