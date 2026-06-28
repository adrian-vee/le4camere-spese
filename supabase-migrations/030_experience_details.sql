-- Separates free-text experience description from the structured experience level chip field
-- experience = structured ("Nessuna", "1-2 anni", "3-5 anni", "5+ anni") → used for scoring
-- experience_details = free text (e.g. hotel names, job descriptions) → NOT used for scoring

ALTER TABLE recruitment_candidates
  ADD COLUMN IF NOT EXISTS experience_details text;
