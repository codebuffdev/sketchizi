-- Repair the core usage tables after deployments where V1 was recorded in
-- sketchizi_ai but the actual tables remained in public. Create the intended
-- schema objects first, then copy every existing row without deleting or
-- altering the legacy public tables. The backend uses only sketchizi_ai.*.

CREATE TABLE IF NOT EXISTS sketchizi_ai.ai_account_locks (
    account_id VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sketchizi_ai.ai_conversations (
    conversation_id UUID PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sketchizi_ai.ai_requests (
    request_id UUID PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    conversation_id UUID NOT NULL
        REFERENCES sketchizi_ai.ai_conversations(conversation_id) ON DELETE CASCADE,
    provider VARCHAR(16) NOT NULL CHECK (provider IN ('builtin', 'byok')),
    status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_code VARCHAR(64),
    CONSTRAINT ck_ai_request_completion CHECK
        ((status = 'succeeded' AND completed_at IS NOT NULL) OR status <> 'succeeded')
);

-- Preserve account-lock timestamps when merging into an existing target table.
DO $$
BEGIN
    IF to_regclass('public.ai_account_locks') IS NOT NULL THEN
        EXECUTE $copy$
            INSERT INTO sketchizi_ai.ai_account_locks AS target (account_id, created_at)
            SELECT account_id, created_at FROM public.ai_account_locks
            ON CONFLICT (account_id) DO UPDATE
                SET created_at = LEAST(target.created_at, EXCLUDED.created_at)
        $copy$;
    END IF;

    IF to_regclass('public.ai_conversations') IS NOT NULL THEN
        EXECUTE $copy$
            INSERT INTO sketchizi_ai.ai_conversations
                (conversation_id, account_id, created_at, last_activity_at)
            SELECT conversation_id, account_id, created_at, last_activity_at
            FROM public.ai_conversations
            ON CONFLICT (conversation_id) DO NOTHING
        $copy$;
    END IF;

    IF to_regclass('public.ai_requests') IS NOT NULL THEN
        EXECUTE $copy$
            INSERT INTO sketchizi_ai.ai_requests
                (request_id, account_id, conversation_id, provider, status, created_at,
                 reserved_at, lease_expires_at, completed_at, error_code)
            SELECT request_id, account_id, conversation_id, provider, status, created_at,
                   reserved_at, lease_expires_at, completed_at, error_code
            FROM public.ai_requests
            ON CONFLICT (request_id) DO NOTHING
        $copy$;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_ai_conversations_account_created
    ON sketchizi_ai.ai_conversations (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_requests_account_success
    ON sketchizi_ai.ai_requests (account_id, completed_at DESC)
    WHERE status = 'succeeded' AND provider = 'builtin';
CREATE INDEX IF NOT EXISTS idx_ai_requests_conversation_success
    ON sketchizi_ai.ai_requests (conversation_id, completed_at DESC)
    WHERE status = 'succeeded' AND provider = 'builtin';
CREATE INDEX IF NOT EXISTS idx_ai_requests_account_pending
    ON sketchizi_ai.ai_requests (account_id, lease_expires_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ai_requests_account_created
    ON sketchizi_ai.ai_requests (account_id, created_at DESC);
