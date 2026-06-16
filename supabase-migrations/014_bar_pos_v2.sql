-- ============================================================
-- BAR POS V2 — Folio camera, sconti, area servizio, split pay,
--               annullamenti, soglia stock, immagini prodotti
-- ============================================================

-- ── Immagini prodotti ──
ALTER TABLE bar_products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ── Soglia stock basso ──
ALTER TABLE bar_products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5;

-- ── Folio camera ──
ALTER TABLE bar_orders ADD COLUMN IF NOT EXISTS room_folio_settled BOOLEAN DEFAULT FALSE;
ALTER TABLE bar_orders ADD COLUMN IF NOT EXISTS room_checkout_date TIMESTAMPTZ;

-- ── Sconti e omaggi ──
ALTER TABLE bar_orders ADD COLUMN IF NOT EXISTS discount_type TEXT;
ALTER TABLE bar_orders ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,2) DEFAULT 0;
ALTER TABLE bar_orders ADD COLUMN IF NOT EXISTS discount_reason TEXT;
ALTER TABLE bar_orders ADD COLUMN IF NOT EXISTS is_complimentary BOOLEAN DEFAULT FALSE;
ALTER TABLE bar_orders ADD COLUMN IF NOT EXISTS complimentary_reason TEXT;

-- ── Area di servizio ──
ALTER TABLE bar_orders ADD COLUMN IF NOT EXISTS service_area TEXT DEFAULT 'bar';

-- ── Split payment ──
ALTER TABLE bar_orders ADD COLUMN IF NOT EXISTS payment_split JSONB;

-- ── Annullamento con motivazione ──
ALTER TABLE bar_orders ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES profiles(id);
ALTER TABLE bar_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE bar_orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- ── Indice folio camera ──
CREATE INDEX IF NOT EXISTS idx_bar_orders_room_folio
  ON bar_orders(room_number, room_folio_settled)
  WHERE payment_method = 'camera' AND status = 'pagato';
