-- ============================================================
-- BAR POS MODULE — Tables, RLS, Seed Data
-- ============================================================

-- Helper: is_manager (admin OR manager)
CREATE OR REPLACE FUNCTION is_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
  );
$$;

-- ── bar_categories ──
CREATE TABLE IF NOT EXISTS bar_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bar_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bar_categories_select" ON bar_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "bar_categories_insert" ON bar_categories
  FOR INSERT TO authenticated WITH CHECK (is_manager());

CREATE POLICY "bar_categories_update" ON bar_categories
  FOR UPDATE TO authenticated USING (is_manager()) WITH CHECK (is_manager());

CREATE POLICY "bar_categories_delete" ON bar_categories
  FOR DELETE TO authenticated USING (is_manager());

-- ── bar_products ──
CREATE TABLE IF NOT EXISTS bar_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES bar_categories(id) ON DELETE SET NULL,
  warehouse_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name text NOT NULL,
  price numeric(10,2) NOT NULL,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bar_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bar_products_select" ON bar_products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "bar_products_insert" ON bar_products
  FOR INSERT TO authenticated WITH CHECK (is_manager());

CREATE POLICY "bar_products_update" ON bar_products
  FOR UPDATE TO authenticated USING (is_manager()) WITH CHECK (is_manager());

CREATE POLICY "bar_products_delete" ON bar_products
  FOR DELETE TO authenticated USING (is_manager());

-- ── bar_orders ──
CREATE TABLE IF NOT EXISTS bar_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number serial,
  operator_id uuid REFERENCES profiles(id),
  payment_method text CHECK (payment_method IN ('contanti', 'carta', 'camera')),
  room_number text,
  guest_name text,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  status text DEFAULT 'aperto' CHECK (status IN ('aperto', 'pagato', 'annullato')),
  cassa_session_id uuid REFERENCES cash_sessions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE bar_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bar_orders_select" ON bar_orders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "bar_orders_insert" ON bar_orders
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "bar_orders_update" ON bar_orders
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "bar_orders_delete" ON bar_orders
  FOR DELETE TO authenticated USING (is_manager());

-- ── bar_order_items ──
CREATE TABLE IF NOT EXISTS bar_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES bar_orders(id) ON DELETE CASCADE,
  bar_product_id uuid REFERENCES bar_products(id),
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL,
  line_total numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bar_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bar_order_items_select" ON bar_order_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "bar_order_items_insert" ON bar_order_items
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "bar_order_items_update" ON bar_order_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "bar_order_items_delete" ON bar_order_items
  FOR DELETE TO authenticated USING (is_manager());

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_bar_products_category ON bar_products(category_id);
CREATE INDEX IF NOT EXISTS idx_bar_products_warehouse ON bar_products(warehouse_product_id);
CREATE INDEX IF NOT EXISTS idx_bar_orders_operator ON bar_orders(operator_id);
CREATE INDEX IF NOT EXISTS idx_bar_orders_created ON bar_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bar_orders_status ON bar_orders(status);
CREATE INDEX IF NOT EXISTS idx_bar_order_items_order ON bar_order_items(order_id);

-- ── Seed: default categories ──
INSERT INTO bar_categories (name, icon, sort_order) VALUES
  ('Caffetteria', 'coffee', 1),
  ('Birre', 'beer', 2),
  ('Vini', 'glass-full', 3),
  ('Cocktail', 'cup', 4),
  ('Analcolici', 'bottle', 5),
  ('Snack', 'cookie', 6)
ON CONFLICT DO NOTHING;
