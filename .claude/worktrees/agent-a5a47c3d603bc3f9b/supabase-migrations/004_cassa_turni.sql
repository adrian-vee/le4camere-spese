-- =============================================
-- 004: Collegamento Cassa ↔ Turni
-- =============================================

-- Add shift columns to cash_sessions
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS shift_date date;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS shift_type text;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS alert_sent boolean NOT NULL DEFAULT false;

-- Backfill existing sessions with date from opened_at
UPDATE cash_sessions SET shift_date = (opened_at AT TIME ZONE 'Europe/Rome')::date WHERE shift_date IS NULL;
