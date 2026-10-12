-- Repair a known schema mismatch from earlier deployments.
-- The legacy rate-limit table may exist in public while runtime SQL now targets
-- sketchizi_ai.ai_rate_limits. Create the target table and copy existing counters
-- without altering or deleting the legacy public table.
CREATE TABLE IF NOT EXISTS sketchizi_ai.ai_rate_limits (
    account_id VARCHAR(255) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL CHECK (request_count >= 1),
    PRIMARY KEY (account_id, window_start)
);

DO $$
BEGIN
    IF to_regclass('public.ai_rate_limits') IS NOT NULL THEN
        EXECUTE $copy$
            INSERT INTO sketchizi_ai.ai_rate_limits AS target
                (account_id, window_start, request_count)
            SELECT account_id, window_start, request_count
            FROM public.ai_rate_limits
            ON CONFLICT (account_id, window_start) DO UPDATE
                SET request_count = GREATEST(target.request_count, EXCLUDED.request_count)
        $copy$;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_expiry
    ON sketchizi_ai.ai_rate_limits (window_start);
