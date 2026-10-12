-- Ensure the replay-protection table exists explicitly in the schema used by the AI service.
-- This is safe when V1/V2 already created the table and does not delete or rewrite rows.
CREATE TABLE IF NOT EXISTS sketchizi_ai.ai_identity_assertions (
    jti UUID PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_identity_assertions_expiry
    ON sketchizi_ai.ai_identity_assertions (expires_at);
