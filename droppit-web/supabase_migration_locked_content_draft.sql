-- Migration: Add locked_content_draft column to drops table
-- This column stores plaintext secrets during the draft staging phase.
-- The existing locked_content column is reserved for encrypted-only payloads written at publish time.
--
-- Run this BEFORE deploying code changes.

ALTER TABLE drops
ADD COLUMN IF NOT EXISTS locked_content_draft text DEFAULT NULL;

-- Migrate any existing plaintext locked_content values from DRAFT rows into the new column.
-- After this migration, locked_content on DRAFT rows should be cleared.
UPDATE drops
SET locked_content_draft = locked_content,
    locked_content = NULL
WHERE status = 'DRAFT'
  AND locked_content IS NOT NULL
  AND locked_content != '';

COMMENT ON COLUMN drops.locked_content_draft IS 'Temporary plaintext staging for locked content during draft phase. Cleared at publish time after encryption.';
COMMENT ON COLUMN drops.locked_content IS 'Encrypted locked content JSON payload. Written only at publish time via encryptLockedContent().';
