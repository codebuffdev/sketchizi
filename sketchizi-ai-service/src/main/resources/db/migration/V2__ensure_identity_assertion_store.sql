-- Repair the identity assertion replay store if an earlier deployment recorded V1
-- in Flyway history but the table is absent. This is additive and safe on existing data.
CREATE TABLE IF NOT EXISTS ai_identity_assertions (
    jti UUID PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_identity_assertions_expiry
    ON ai_identity_assertions (expires_at);
