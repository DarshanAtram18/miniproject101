-- Migration 013: Add email job queue for automated appreciation letter delivery
-- Creates the email_jobs table for asynchronous, reliable email delivery
-- of HOD-approved and signed appreciation letters.

CREATE TABLE IF NOT EXISTS email_jobs (
  id                  BIGSERIAL PRIMARY KEY,
  achievement_id      INT NOT NULL REFERENCES activity(act_id) ON DELETE CASCADE,
  recipient_user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email     VARCHAR(255) NOT NULL,
  letter_version      INT NOT NULL DEFAULT 1,
  pdf_reference       VARCHAR(500) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  attempt_count       INT NOT NULL DEFAULT 0,
  max_attempts        INT NOT NULL DEFAULT 3,
  last_error          TEXT,
  provider_message_id VARCHAR(255),
  next_retry_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at           TIMESTAMPTZ,
  locked_by           VARCHAR(100),
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_email_jobs_achievement_version UNIQUE (achievement_id, letter_version)
);

CREATE INDEX IF NOT EXISTS idx_email_jobs_status_retry
  ON email_jobs (status, next_retry_at)
  WHERE status IN ('PENDING', 'SENDING', 'FAILED');

CREATE INDEX IF NOT EXISTS idx_email_jobs_achievement
  ON email_jobs (achievement_id);

INSERT INTO schema_migrations (version) VALUES ('013_appreciation_email_queue.sql')
ON CONFLICT (version) DO NOTHING;
