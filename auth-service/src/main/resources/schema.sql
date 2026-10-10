CREATE TABLE IF NOT EXISTS sketchizi_users
(
    id               BIGSERIAL PRIMARY KEY,
    provider         VARCHAR(32)  NOT NULL,
    provider_subject VARCHAR(255) NOT NULL,
    email            VARCHAR(320),
    display_name     VARCHAR(255),
    picture_url      TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sketchizi_users_provider_subject
        UNIQUE (provider, provider_subject)
);
