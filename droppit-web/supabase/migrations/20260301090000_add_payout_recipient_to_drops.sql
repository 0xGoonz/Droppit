-- Add payout_recipient to drops table
ALTER TABLE drops ADD COLUMN IF NOT EXISTS payout_recipient VARCHAR(42);
