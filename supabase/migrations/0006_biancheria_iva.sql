-- =====================================================================
-- 0006 — Gestione IVA prodotti + Biancheria L'Italiana S.R.L.
-- =====================================================================

-- ── 1. Nuove colonne su products ──
ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) DEFAULT 22.00;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_code TEXT;

-- ── 2. Ricrea la vista stock_levels includendo le nuove colonne ──
DROP VIEW IF EXISTS stock_levels;
CREATE VIEW stock_levels AS
SELECT
  p.id   AS product_id,
  p.name, p.brand, p.category, p.unit, p.unit_cost, p.vat_rate,
  p.min_stock, p.supplier_id, p.default_supplier_id, p.supplier_code,
  p.notes, p.active, p.barcode, p.expiry_date,
  p.tracking_type, p.bottle_capacity_ml, p.standard_pour_ml,
  p.created_at, p.updated_at,
  COALESCE((
    SELECT SUM(CASE WHEN sm.type = 'in' THEN sm.quantity ELSE -sm.quantity END)
    FROM stock_movements sm WHERE sm.product_id = p.id
  ), 0)::int AS current_stock
FROM products p;

GRANT SELECT ON stock_levels TO authenticated, anon, service_role;

-- ── 3. Categoria spese "Biancheria" (se non esiste) ──
INSERT INTO categories (name, color, sort)
VALUES ('Biancheria', '#4F7B8C', 85)
ON CONFLICT (name) DO NOTHING;

-- ── 4. Fornitore L'Italiana S.R.L. ──
DO $$
DECLARE
  _sid UUID;
BEGIN
  SELECT id INTO _sid FROM suppliers WHERE name ILIKE '%italiana%' LIMIT 1;
  IF _sid IS NULL THEN
    INSERT INTO suppliers (name, phone, email, address, category, active)
    VALUES (
      'L''Italiana S.R.L.',
      '045-6859005',
      'info@italianasrl.it',
      'Via Serenissima 5, 37050 Oppeano, Verona',
      'Biancheria',
      true
    ) RETURNING id INTO _sid;
  END IF;

  -- Salva l'id per i prodotti
  PERFORM set_config('app.italiana_id', _sid::text, true);
END $$;

-- ── 5. Inserimento 12 prodotti biancheria ──
DO $$
DECLARE
  _sid UUID := (current_setting('app.italiana_id', true))::uuid;
  _pid UUID;
  _prod RECORD;
BEGIN
  FOR _prod IN
    SELECT * FROM (VALUES
      ('Lenzuolo matrimoniale 240x290 bianco',      'LENMAT-0001',  1.28),
      ('Federa 55x95 bianca',                       'FED-0001',     0.34),
      ('Telo bagno spugna 100x150 tre righe',       'TELO-0001',    1.02),
      ('Asciugamano spugna 60x100 tre righe',       'VISO-0001',    0.55),
      ('Bidet spugna 40x60 tre righe',              'BIDET-0001',   0.34),
      ('Scendibagno spugna 50x70 tre righe',        'TAP-0001',     0.55),
      ('Copripiumino matrimoniale 256x218 rigati',  'COPMAT-0002',  2.33),
      ('Copripiumino francese 205x220',             'COPFRA-0002',  1.89),
      ('Lenzuolo francese 210x300 bianco',          'LENFRA-0001',  1.15),
      ('Accappatoio spugna bianco',                 'ACC-0008',     2.08),
      ('Sacco portabiancheria',                     'SACCO',        0.16),
      ('Roll portabiancheria',                      'ROLL',         0.00)
    ) AS t(name, code, price)
  LOOP
    -- Inserisci solo se non esiste gia
    IF NOT EXISTS (SELECT 1 FROM products WHERE name = _prod.name) THEN
      INSERT INTO products (
        name, category, unit, unit_cost, vat_rate, supplier_code,
        default_supplier_id, min_stock, active, tracking_type
      ) VALUES (
        _prod.name, 'Biancheria', 'pz', _prod.price, 22.00, _prod.code,
        _sid, 0, true, 'units'
      ) RETURNING id INTO _pid;
    END IF;
  END LOOP;
END $$;

-- ── 6. Stock iniziale (consegna 16/06/2026) ──
DO $$
DECLARE
  _sid  UUID := (current_setting('app.italiana_id', true))::uuid;
  _pid  UUID;
  _item RECORD;
BEGIN
  FOR _item IN
    SELECT * FROM (VALUES
      ('Lenzuolo matrimoniale 240x290 bianco',      10),
      ('Federa 55x95 bianca',                       60),
      ('Telo bagno spugna 100x150 tre righe',       20),
      ('Asciugamano spugna 60x100 tre righe',       10),
      ('Bidet spugna 40x60 tre righe',              10),
      ('Scendibagno spugna 50x70 tre righe',        20),
      ('Copripiumino matrimoniale 256x218 rigati',   15),
      ('Sacco portabiancheria',                      13),
      ('Roll portabiancheria',                        1),
      ('Copripiumino francese 205x220',               0),
      ('Lenzuolo francese 210x300 bianco',            0),
      ('Accappatoio spugna bianco',                   0)
    ) AS t(name, qty)
  LOOP
    SELECT id INTO _pid FROM products WHERE name = _item.name LIMIT 1;
    IF _pid IS NULL OR _item.qty = 0 THEN CONTINUE; END IF;

    -- Evita duplicati: skip se esiste gia un movimento per questo prodotto con nota "Carico iniziale biancheria"
    IF EXISTS (SELECT 1 FROM stock_movements WHERE product_id = _pid AND notes = 'Carico iniziale biancheria') THEN
      CONTINUE;
    END IF;

    INSERT INTO stock_movements (product_id, type, quantity, notes)
    VALUES (_pid, 'in', _item.qty, 'Carico iniziale biancheria');

    INSERT INTO product_batches (product_id, quantity_initial, quantity_remaining, source, notes)
    VALUES (_pid, _item.qty, _item.qty, 'manual', 'Carico iniziale biancheria');
  END LOOP;
END $$;
