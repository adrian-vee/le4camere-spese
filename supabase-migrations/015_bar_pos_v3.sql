-- ============================================================
-- BAR POS V3 — drink_lab_id per importazione da Drink Lab
-- ============================================================

ALTER TABLE bar_products ADD COLUMN IF NOT EXISTS drink_lab_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bar_products_drink_lab_id
  ON bar_products(drink_lab_id) WHERE drink_lab_id IS NOT NULL;
