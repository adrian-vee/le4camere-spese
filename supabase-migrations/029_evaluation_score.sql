-- ══════════════════════════════════════════════════════════════════
-- 029 — Saved evaluation score + breakdown
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE recruitment_candidates
  ADD COLUMN IF NOT EXISTS evaluation_score integer,
  ADD COLUMN IF NOT EXISTS evaluation_breakdown jsonb;
