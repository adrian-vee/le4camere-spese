-- Migration: 0007_allergeni.sql
-- Tabelle per gestione allergeni colazione (Reg. UE 1169/2011)

CREATE TABLE IF NOT EXISTS breakfast_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  name_de TEXT,
  category TEXT DEFAULT 'altro',
  allergens TEXT[] DEFAULT '{}',
  may_contain TEXT[] DEFAULT '{}',
  is_on_buffet BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS allergen_guest_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token UUID DEFAULT gen_random_uuid(),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE breakfast_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergen_guest_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read breakfast_products"
  ON breakfast_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert breakfast_products"
  ON breakfast_products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update breakfast_products"
  ON breakfast_products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete breakfast_products"
  ON breakfast_products FOR DELETE TO authenticated USING (true);

CREATE POLICY "Anon can read breakfast_products"
  ON breakfast_products FOR SELECT TO anon USING (true);

CREATE POLICY "Authenticated users can manage tokens"
  ON allergen_guest_tokens FOR ALL TO authenticated USING (true);
CREATE POLICY "Anon can read active tokens"
  ON allergen_guest_tokens FOR SELECT TO anon USING (active = true);

-- Seed data: prodotti colazione tipici
INSERT INTO breakfast_products (name, name_en, name_de, category, allergens, may_contain, is_on_buffet) VALUES
  ('Cornetto', 'Croissant', 'Croissant', 'dolce', ARRAY['glutine','uova','latte'], ARRAY['soia'], true),
  ('Croissant integrale', 'Whole wheat croissant', 'Vollkorn-Croissant', 'dolce', ARRAY['glutine','uova','latte'], '{}', true),
  ('Latte intero', 'Whole milk', 'Vollmilch', 'bevanda', ARRAY['latte'], '{}', true),
  ('Caffè', 'Coffee', 'Kaffee', 'bevanda', '{}', '{}', true),
  ('Cappuccino', 'Cappuccino', 'Cappuccino', 'bevanda', ARRAY['latte'], '{}', true),
  ('Marmellata', 'Jam', 'Marmelade', 'altro', '{}', ARRAY['solfiti'], true),
  ('Biscotti frollini', 'Butter cookies', 'Butterkekse', 'dolce', ARRAY['glutine','uova','latte','soia'], '{}', true),
  ('Pane bianco', 'White bread', 'Weißbrot', 'panificati', ARRAY['glutine'], ARRAY['sesamo'], true),
  ('Burro', 'Butter', 'Butter', 'altro', ARRAY['latte'], '{}', true),
  ('Yogurt', 'Yogurt', 'Joghurt', 'altro', ARRAY['latte'], '{}', true),
  ('Succo d''arancia', 'Orange juice', 'Orangensaft', 'bevanda', '{}', '{}', true),
  ('Fette biscottate', 'Rusks', 'Zwieback', 'panificati', ARRAY['glutine'], ARRAY['latte'], true),
  ('Crema di nocciole', 'Hazelnut spread', 'Nuss-Nougat-Creme', 'dolce', ARRAY['latte','frutta_a_guscio','soia'], '{}', true),
  ('Spremuta fresca', 'Fresh juice', 'Frischer Saft', 'bevanda', '{}', '{}', true),
  ('Frutta fresca', 'Fresh fruit', 'Frisches Obst', 'frutta', '{}', '{}', true);

-- Crea un token iniziale per QR ospiti
INSERT INTO allergen_guest_tokens (active) VALUES (true);
