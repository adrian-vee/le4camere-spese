-- Dismissed notifications table
CREATE TABLE IF NOT EXISTS dismissed_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_key text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_key)
);

-- RLS
ALTER TABLE dismissed_notifications ENABLE ROW LEVEL SECURITY;

-- Users manage only their own dismissals
CREATE POLICY "Users manage own dismissed notifications"
  ON dismissed_notifications FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_dismissed_notif_user ON dismissed_notifications(user_id, notification_key);
