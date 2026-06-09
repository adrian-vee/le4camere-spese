-- =============================================
-- 012: Monthly Availability + 3-state status
-- Extends availability system to support full-month submissions
-- and preferred/available/unavailable states
-- =============================================

-- 1. Add 3-state status column to staff_week_availability
ALTER TABLE staff_week_availability
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available';

-- Backfill from boolean
UPDATE staff_week_availability
SET status = CASE WHEN available THEN 'available' ELSE 'unavailable' END
WHERE status = 'available' AND NOT available;

-- 2. Allow month-based submissions (week_start nullable for month-only rows)
ALTER TABLE staff_availability_submissions
  ALTER COLUMN week_start DROP NOT NULL;

ALTER TABLE staff_availability_submissions
  ADD COLUMN IF NOT EXISTS month_start date;

-- Index for fast month lookups
CREATE INDEX IF NOT EXISTS idx_sas_month
  ON staff_availability_submissions(staff_id, month_start)
  WHERE month_start IS NOT NULL;
