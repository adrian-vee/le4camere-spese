-- ============================================================
-- BAR POS — Remaining features: bar_pin, misto payment, omaggio
-- ============================================================

-- ── PIN bar su profiles per cambio operatore rapido ──
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bar_pin TEXT;

-- ── Aggiungere 'misto' e 'omaggio' ai metodi di pagamento ──
-- Rimuovere il CHECK constraint esistente e ricrearlo con i nuovi valori
ALTER TABLE bar_orders DROP CONSTRAINT IF EXISTS bar_orders_payment_method_check;
ALTER TABLE bar_orders ADD CONSTRAINT bar_orders_payment_method_check
  CHECK (payment_method IN ('contanti', 'carta', 'camera', 'omaggio', 'misto'));
