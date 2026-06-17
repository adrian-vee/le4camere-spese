-- =============================================
-- 003: Roles + Cash Register (Cassa) module
-- =============================================

-- 1. Add role column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'staff'
  CHECK (role IN ('admin', 'manager', 'staff'));

-- Set the first user (or your admin) to admin:
-- UPDATE profiles SET role = 'admin' WHERE id = '<your-user-id>';

-- 2. Cash sessions
CREATE TABLE IF NOT EXISTS cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  closed_by uuid REFERENCES auth.users(id),
  opening_amount numeric(10,2) NOT NULL DEFAULT 0,
  expected_amount numeric(10,2),
  actual_amount numeric(10,2),
  difference numeric(10,2),
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

-- 3. Cash movements
CREATE TABLE IF NOT EXISTS cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  type text NOT NULL CHECK (type IN ('entrata', 'uscita')),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  category text NOT NULL DEFAULT 'altro',
  description text,
  receipt_url text
);

-- 4. RLS
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select cash_sessions"
  ON cash_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can insert cash_sessions"
  ON cash_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated can update cash_sessions"
  ON cash_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can select cash_movements"
  ON cash_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can insert cash_movements"
  ON cash_movements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated can update cash_movements"
  ON cash_movements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated can delete cash_movements"
  ON cash_movements FOR DELETE TO authenticated USING (true);
