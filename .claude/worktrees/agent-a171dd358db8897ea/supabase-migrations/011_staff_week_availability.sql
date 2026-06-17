-- =============================================
-- 011: Staff Week Availability System
-- Per-week availability submissions by "a chiamata" staff
-- =============================================

-- 1. Link staff to auth profiles
ALTER TABLE staff ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_staff_profile_id ON staff(profile_id);

-- 2. Base weekly availability (admin-managed, used by personale page)
--    This table was referenced in code but never migrated
CREATE TABLE IF NOT EXISTS staff_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  shift_type_id uuid NOT NULL REFERENCES shift_types(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT true,
  UNIQUE(staff_id, weekday, shift_type_id)
);

ALTER TABLE staff_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_availability_all" ON staff_availability FOR ALL USING (true) WITH CHECK (true);

-- 3. Per-week granular availability (staff-submitted)
CREATE TABLE IF NOT EXISTS staff_week_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  avail_date date NOT NULL,
  shift_type_id uuid NOT NULL REFERENCES shift_types(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT true,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id, avail_date, shift_type_id)
);

CREATE INDEX IF NOT EXISTS idx_swa_staff_date ON staff_week_availability(staff_id, avail_date);
ALTER TABLE staff_week_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "swa_all" ON staff_week_availability FOR ALL USING (true) WITH CHECK (true);

-- 4. Track submission status per week
CREATE TABLE IF NOT EXISTS staff_availability_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id, week_start)
);

ALTER TABLE staff_availability_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sas_all" ON staff_availability_submissions FOR ALL USING (true) WITH CHECK (true);

-- 5. Add missing columns to absences (referenced in code but missing from 0002)
ALTER TABLE absences ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE absences ADD COLUMN IF NOT EXISTS type text;
