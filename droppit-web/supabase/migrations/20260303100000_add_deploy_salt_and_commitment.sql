-- Stage deploy commitment metadata for frame tx-build/finalize consistency.
ALTER TABLE public.drops
ADD COLUMN IF NOT EXISTS deploy_salt TEXT,
ADD COLUMN IF NOT EXISTS deploy_commitment TEXT;

COMMENT ON COLUMN public.drops.deploy_salt IS
    'Temporary random bytes32 salt generated at tx-build time for locked-content commitment. Cleared at publish.';

COMMENT ON COLUMN public.drops.deploy_commitment IS
    'Temporary keccak256(bytes32 salt || locked_content_draft) staged for frame deploy consistency. Cleared at publish.';
