-- Notifications table for in-app messages (e.g., appreciation letter issued)
CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         VARCHAR(50)  NOT NULL DEFAULT 'info',
  title        VARCHAR(255) NOT NULL,
  message      TEXT         NOT NULL,
  activity_id  INTEGER REFERENCES activity(act_id) ON DELETE SET NULL,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(user_id, is_read) WHERE is_read = FALSE;
