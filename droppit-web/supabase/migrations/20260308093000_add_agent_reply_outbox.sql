-- Add future-ready agent draft metadata and a durable public-post outbox.

ALTER TABLE public.drops
ADD COLUMN IF NOT EXISTS source_asset_uri TEXT,
ADD COLUMN IF NOT EXISTS creation_source TEXT,
ADD COLUMN IF NOT EXISTS agent_parse JSONB,
ADD COLUMN IF NOT EXISTS agent_reply_cast_hash TEXT;

COMMENT ON COLUMN public.drops.creation_source IS
    'How the draft was created (for example web or farcaster_agent).';
COMMENT ON COLUMN public.drops.agent_parse IS
    'Structured parse metadata captured during agentic creation.';
COMMENT ON COLUMN public.drops.source_asset_uri IS
    'Original media URI extracted from the Farcaster cast or AI parse before normalization.';
COMMENT ON COLUMN public.drops.agent_reply_cast_hash IS
    'Public Farcaster reply cast hash created by the Droppit bot for this draft.';

CREATE TABLE IF NOT EXISTS public.agent_post_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_type TEXT NOT NULL,
    source_cast_hash TEXT NOT NULL,
    drop_id UUID,
    status TEXT NOT NULL DEFAULT 'pending',
    published_cast_hash TEXT,
    error TEXT,
    request_payload JSONB,
    response_payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT agent_post_outbox_source_post_unique UNIQUE (source_cast_hash, post_type)
);

CREATE INDEX IF NOT EXISTS idx_agent_post_outbox_drop_id
    ON public.agent_post_outbox(drop_id);
CREATE INDEX IF NOT EXISTS idx_agent_post_outbox_status
    ON public.agent_post_outbox(status);

COMMENT ON TABLE public.agent_post_outbox IS
    'Durable outbox for public Farcaster posts published by the Droppit agent.';
COMMENT ON COLUMN public.agent_post_outbox.request_payload IS
    'Serialized publish request payload including text, embeds, and parent cast hash.';
COMMENT ON COLUMN public.agent_post_outbox.response_payload IS
    'Raw publish response payload returned by the Farcaster provider.';
