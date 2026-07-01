-- ============================================================
-- 030: Fix utility_bills_utility_type_check constraint
-- ============================================================
-- STEP 0: Run this query FIRST to see current constraint definition:
--
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.utility_bills'::regclass
--     AND contype = 'c';
--
-- This shows exactly which values are currently allowed.
-- ============================================================

-- Drop the old constraint (whatever values it had)
ALTER TABLE public.utility_bills
  DROP CONSTRAINT IF EXISTS utility_bills_utility_type_check;

-- Recreate with all 5 types used by the application
ALTER TABLE public.utility_bills
  ADD CONSTRAINT utility_bills_utility_type_check
  CHECK (utility_type IN ('Luce', 'Gas', 'Acqua', 'Immondizia', 'Internet'));
