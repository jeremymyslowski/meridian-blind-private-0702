-- Add support for scheduled exponential backoff retries on webhook events
-- This enables the finished implementation in qa-fixtures/partial-implementations/webhook-retry/

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- Update existing rows to be immediately eligible
UPDATE webhook_events
SET next_attempt_at = created_at
WHERE next_attempt_at IS NULL;

-- Add partial index for efficient ready-event queries (only unprocessed + ready)
CREATE INDEX IF NOT EXISTS idx_webhook_events_ready
    ON webhook_events (next_attempt_at)
    WHERE processed = FALSE AND attempts < 5;

-- Optional: backfill attempts for any legacy rows if needed
-- UPDATE webhook_events SET attempts = 0 WHERE attempts IS NULL;