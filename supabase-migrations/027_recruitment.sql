-- ══════════════════════════════════════════════════════════════════
-- 027 — Recruitment: candidates, documents, storage, settings key
-- ══════════════════════════════════════════════════════════════════

-- ── recruitment_candidates ──
CREATE TABLE IF NOT EXISTS public.recruitment_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Phase 1: Anagrafici
  first_name text NOT NULL,
  last_name text NOT NULL,
  birth_date date,
  residence text,
  phone text,
  email text,
  has_car boolean NOT NULL DEFAULT false,
  distance_km numeric(6,1),

  -- Phase 2: Esperienza
  position_applied text,
  experience text,
  languages text,
  availability text,
  employment_type_sought text,
  can_start_date date,

  -- Phase 3: Valutazione
  interview_notes text,
  strengths text,
  weaknesses text,
  rating integer CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),

  -- Phase 5: Privacy
  privacy_consent boolean NOT NULL DEFAULT false,
  privacy_consent_at timestamptz,
  signature_url text,
  signed_document_url text,

  -- Phase 6: Esito
  outcome text NOT NULL DEFAULT 'in_valutazione'
    CHECK (outcome IN ('da_richiamare','in_valutazione','idoneo','non_idoneo')),
  converted boolean NOT NULL DEFAULT false,
  converted_to text CHECK (converted_to IS NULL OR converted_to IN ('dipendente','a_chiamata')),
  converted_at timestamptz,
  onboarding_process_id uuid,

  -- Stepper state
  current_phase integer NOT NULL DEFAULT 1 CHECK (current_phase >= 1 AND current_phase <= 6),
  completed_phases integer[] NOT NULL DEFAULT '{}',

  -- Meta
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_recruitment_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS set_recruitment_updated_at ON recruitment_candidates;
CREATE TRIGGER set_recruitment_updated_at
  BEFORE UPDATE ON recruitment_candidates
  FOR EACH ROW EXECUTE FUNCTION trg_recruitment_updated_at();

-- RLS
ALTER TABLE recruitment_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recruitment_candidates_select"
  ON recruitment_candidates FOR SELECT TO authenticated
  USING (is_manager());

CREATE POLICY "recruitment_candidates_insert"
  ON recruitment_candidates FOR INSERT TO authenticated
  WITH CHECK (is_manager());

CREATE POLICY "recruitment_candidates_update"
  ON recruitment_candidates FOR UPDATE TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

CREATE POLICY "recruitment_candidates_delete"
  ON recruitment_candidates FOR DELETE TO authenticated
  USING (is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_outcome ON recruitment_candidates(outcome);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_created ON recruitment_candidates(created_at DESC);


-- ── recruitment_documents ──
CREATE TABLE IF NOT EXISTS public.recruitment_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES recruitment_candidates(id) ON DELETE CASCADE,
  doc_type text,
  file_url text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT '',
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recruitment_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recruitment_documents_select"
  ON recruitment_documents FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "recruitment_documents_insert"
  ON recruitment_documents FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "recruitment_documents_delete"
  ON recruitment_documents FOR DELETE TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_recruitment_documents_candidate ON recruitment_documents(candidate_id);


-- ── Storage bucket ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('recruitment-files', 'recruitment-files', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "recruitment_files_select" ON storage.objects;
CREATE POLICY "recruitment_files_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recruitment-files');

DROP POLICY IF EXISTS "recruitment_files_insert" ON storage.objects;
CREATE POLICY "recruitment_files_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recruitment-files');

DROP POLICY IF EXISTS "recruitment_files_delete" ON storage.objects;
CREATE POLICY "recruitment_files_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'recruitment-files');


-- ── Settings: recruitment privacy text ──
INSERT INTO settings (key, value, updated_at)
VALUES ('recruitment_privacy_text', '"Informativa ai sensi del Regolamento UE 2016/679 (GDPR). I dati personali raccolti saranno trattati esclusivamente per le finalità di selezione del personale."'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
