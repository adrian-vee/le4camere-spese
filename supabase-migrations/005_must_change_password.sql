-- =============================================
-- 005: Cambio password obbligatorio al primo login
-- =============================================

-- Add must_change_password column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;

-- Existing admins should NOT be forced to change password
UPDATE profiles SET must_change_password = false WHERE role = 'admin';

-- Existing users who have been using the system already - don't force them
UPDATE profiles SET must_change_password = false WHERE must_change_password = true AND role IN ('manager', 'staff');
