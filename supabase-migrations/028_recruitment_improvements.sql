-- ══════════════════════════════════════════════════════════════════
-- 028 — Recruitment improvements: document checklist + follow-up interviews
-- ══════════════════════════════════════════════════════════════════

-- Document checklist: array of {key, label, checked, notes}
ALTER TABLE recruitment_candidates
  ADD COLUMN IF NOT EXISTS documents_checklist jsonb NOT NULL DEFAULT '[]';

-- Follow-up interviews: array of {date, notes}
ALTER TABLE recruitment_candidates
  ADD COLUMN IF NOT EXISTS follow_up_interviews jsonb NOT NULL DEFAULT '[]';
