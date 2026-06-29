-- ══════════════════════════════════════════════════════════════════
-- 032 — Smoobu integration: apartments + bookings
-- Apartments sono le proprietà in Smoobu, mappabili alle rooms locali.
-- Bookings sono le prenotazioni sincronizzate periodicamente.
-- La scrittura avviene da cron/server con service role (bypassa RLS).
-- SELECT consentito a tutti gli utenti autenticati.
-- ══════════════════════════════════════════════════════════════════

-- ── smoobu_apartments ──
CREATE TABLE IF NOT EXISTS public.smoobu_apartments (
  id BIGINT PRIMARY KEY,                            -- apartment id da Smoobu (NON generato)
  name TEXT NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,  -- mappatura opzionale verso camera locale
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smoobu_apartments_room_id ON smoobu_apartments(room_id);

-- ── smoobu_bookings ──
CREATE TABLE IF NOT EXISTS public.smoobu_bookings (
  id BIGINT PRIMARY KEY,                            -- booking id da Smoobu (NON generato)
  apartment_id BIGINT REFERENCES public.smoobu_apartments(id) ON DELETE CASCADE,
  channel_name TEXT,
  booking_type TEXT,                                -- reservation / modification of booking / cancellation
  arrival DATE NOT NULL,
  departure DATE NOT NULL,
  nights INT NOT NULL DEFAULT 0,
  guest_name TEXT,
  adults INT DEFAULT 0,
  children INT DEFAULT 0,
  price NUMERIC DEFAULT 0,
  price_paid BOOLEAN DEFAULT FALSE,
  prepayment NUMERIC DEFAULT 0,
  deposit NUMERIC DEFAULT 0,
  is_blocked BOOLEAN DEFAULT FALSE,
  is_cancelled BOOLEAN DEFAULT FALSE,
  smoobu_created_at TIMESTAMPTZ,
  smoobu_modified_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smoobu_bookings_apartment_id ON smoobu_bookings(apartment_id);
CREATE INDEX IF NOT EXISTS idx_smoobu_bookings_arrival ON smoobu_bookings(arrival);
CREATE INDEX IF NOT EXISTS idx_smoobu_bookings_departure ON smoobu_bookings(departure);
CREATE INDEX IF NOT EXISTS idx_smoobu_bookings_channel ON smoobu_bookings(channel_name);

-- Trigger per updated_at
CREATE OR REPLACE FUNCTION update_smoobu_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_smoobu_apartments_updated_at
  BEFORE UPDATE ON smoobu_apartments
  FOR EACH ROW EXECUTE FUNCTION update_smoobu_updated_at();

CREATE TRIGGER trg_smoobu_bookings_updated_at
  BEFORE UPDATE ON smoobu_bookings
  FOR EACH ROW EXECUTE FUNCTION update_smoobu_updated_at();

-- ── RLS ──
ALTER TABLE smoobu_apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE smoobu_bookings ENABLE ROW LEVEL SECURITY;

-- SELECT: tutti gli utenti autenticati
CREATE POLICY "smoobu_apartments_select"
  ON smoobu_apartments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "smoobu_bookings_select"
  ON smoobu_bookings FOR SELECT TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE: solo admin (il cron usa service role e bypassa RLS,
-- ma se un admin vuole scrivere da frontend, serve la policy)
CREATE POLICY "smoobu_apartments_admin_write"
  ON smoobu_apartments FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "smoobu_bookings_admin_write"
  ON smoobu_bookings FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
