-- ══════════════════════════════════════════════════════════════════
-- 031 — Shift audit log: chi ha modificato i turni e quando
-- Solo admin può leggere. Il log è immutabile (no UPDATE/DELETE).
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shift_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid,
  action text NOT NULL CHECK (action IN ('created','updated','deleted')),
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_role text,
  shift_date date,
  employee_name text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_shift_audit_log_shift_id ON shift_audit_log(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_audit_log_changed_by ON shift_audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_shift_audit_log_created_at ON shift_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_audit_log_shift_date ON shift_audit_log(shift_date);

-- RLS
ALTER TABLE shift_audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: solo admin
CREATE POLICY "shift_audit_log_select"
  ON shift_audit_log FOR SELECT TO authenticated
  USING (is_admin());

-- INSERT: qualsiasi utente autenticato (il log viene scritto da chi modifica)
CREATE POLICY "shift_audit_log_insert"
  ON shift_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- Nessuna policy UPDATE/DELETE: il log è immutabile
