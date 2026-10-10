CREATE TABLE ai_account_locks (
    account_id VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ai_conversations (
    conversation_id UUID PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ai_conversations_account_created ON ai_conversations (account_id, created_at DESC);

CREATE TABLE ai_requests (
    request_id UUID PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    conversation_id UUID NOT NULL REFERENCES ai_conversations(conversation_id) ON DELETE CASCADE,
    provider VARCHAR(16) NOT NULL CHECK (provider IN ('builtin', 'byok')),
    status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_code VARCHAR(64),
    CONSTRAINT ck_ai_request_completion CHECK ((status = 'succeeded' AND completed_at IS NOT NULL) OR status <> 'succeeded')
);
CREATE INDEX idx_ai_requests_account_success ON ai_requests (account_id, completed_at DESC) WHERE status = 'succeeded' AND provider = 'builtin';
CREATE INDEX idx_ai_requests_conversation_success ON ai_requests (conversation_id, completed_at DESC) WHERE status = 'succeeded' AND provider = 'builtin';
CREATE INDEX idx_ai_requests_account_pending ON ai_requests (account_id, lease_expires_at) WHERE status = 'pending';
CREATE INDEX idx_ai_requests_account_created ON ai_requests (account_id, created_at DESC);

-- Short-lived identity assertion IDs are consumed once to prevent replay.
CREATE TABLE ai_identity_assertions (
    jti UUID PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ai_identity_assertions_expiry ON ai_identity_assertions (expires_at);

-- Atomic fixed-minute request limiter for all authenticated API activity, including invalid bodies.
CREATE TABLE ai_rate_limits (
    account_id VARCHAR(255) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL CHECK (request_count >= 1),
    PRIMARY KEY (account_id, window_start)
);
CREATE INDEX idx_ai_rate_limits_expiry ON ai_rate_limits (window_start);
