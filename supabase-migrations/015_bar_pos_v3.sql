-- 015: Bar POS v3 — Drink Lab import support
-- Adds drink_lab_id to bar_products for linking to static BAR_RECIPES

ALTER TABLE bar_products
  ADD COLUMN IF NOT EXISTS drink_lab_id TEXT UNIQUE;

COMMENT ON COLUMN bar_products.drink_lab_id IS 'Maps to BAR_RECIPES[].id from barRecipes.ts (e.g. "spritz-aperol")';
