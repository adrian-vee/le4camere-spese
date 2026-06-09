-- =============================================
-- 006: Activity Log per pannello admin
-- =============================================

CREATE TABLE IF NOT EXISTS activity_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  user_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  module text NOT NULL,
  description text NOT NULL DEFAULT '',
  details jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_module ON activity_log(module);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);

-- RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can insert their own activity
CREATE POLICY "Users can insert own activity" ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only admin can read all activity
CREATE POLICY "Admin can read all activity" ON activity_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
