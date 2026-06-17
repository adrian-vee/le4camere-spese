-- 015: Bar POS v3 — Drink Lab import support
-- Adds drink_lab_id to bar_products for linking to static BAR_RECIPES

ALTER TABLE bar_products
  ADD COLUMN IF NOT EXISTS drink_lab_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bar_products_drink_lab_id
  ON bar_products(drink_lab_id) WHERE drink_lab_id IS NOT NULL;

COMMENT ON COLUMN bar_products.drink_lab_id IS 'Maps to BAR_RECIPES[].id from barRecipes.ts (e.g. "spritz-aperol")';
