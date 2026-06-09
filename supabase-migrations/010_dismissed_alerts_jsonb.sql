-- Add dismissed_alerts jsonb column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dismissed_alerts jsonb NOT NULL DEFAULT '[]'::jsonb;
