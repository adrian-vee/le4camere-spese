-- ============================================================
-- 033_controls.sql — Controlli e Analisi di laboratorio
-- ============================================================

-- 1. Tabella principale: controls
CREATE TABLE IF NOT EXISTS controls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL DEFAULT 'acqua_potabile',
  laboratorio text NOT NULL DEFAULT '',
  data_prelievo date NOT NULL,
  periodicita_mesi int,
  prossimo_controllo date,
  esito_generale text NOT NULL DEFAULT 'in_attesa'
    CHECK (esito_generale IN ('conforme', 'non_conforme', 'in_attesa')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id)
);

-- 2. Tabella punti di prelievo: control_samples
CREATE TABLE IF NOT EXISTS control_samples (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id  uuid NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
  punto_prelievo text NOT NULL DEFAULT '',
  esito       text NOT NULL DEFAULT 'in_attesa'
    CHECK (esito IN ('conforme', 'non_conforme', 'in_attesa')),
  referto_url text,
  note        text
);

-- 3. Indici
CREATE INDEX IF NOT EXISTS idx_controls_tipo ON controls(tipo);
CREATE INDEX IF NOT EXISTS idx_controls_data ON controls(data_prelievo DESC);
CREATE INDEX IF NOT EXISTS idx_controls_prossimo ON controls(prossimo_controllo);
CREATE INDEX IF NOT EXISTS idx_control_samples_control ON control_samples(control_id);

-- 4. RLS su controls
ALTER TABLE controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "controls_select" ON controls FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "controls_insert" ON controls FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "controls_update" ON controls FOR UPDATE
  TO authenticated USING (created_by = auth.uid() OR is_admin());

CREATE POLICY "controls_delete" ON controls FOR DELETE
  TO authenticated USING (created_by = auth.uid() OR is_admin());

-- 5. RLS su control_samples
ALTER TABLE control_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "control_samples_select" ON control_samples FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "control_samples_insert" ON control_samples FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM controls WHERE id = control_id)
  );

CREATE POLICY "control_samples_update" ON control_samples FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM controls WHERE id = control_id AND (created_by = auth.uid() OR is_admin()))
  );

CREATE POLICY "control_samples_delete" ON control_samples FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM controls WHERE id = control_id AND (created_by = auth.uid() OR is_admin()))
  );

-- 6. Storage bucket per i referti PDF
INSERT INTO storage.buckets (id, name, public)
VALUES ('controlli-referti', 'controlli-referti', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "referti_select" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'controlli-referti');

CREATE POLICY "referti_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'controlli-referti');

CREATE POLICY "referti_update" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'controlli-referti' AND (auth.uid()::text = (storage.foldername(name))[1] OR is_admin()));

CREATE POLICY "referti_delete" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'controlli-referti' AND (auth.uid()::text = (storage.foldername(name))[1] OR is_admin()));
