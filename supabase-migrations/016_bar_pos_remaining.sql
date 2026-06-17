-- ============================================================
-- BAR POS — Funzionalità rimanenti
-- bar_pin per cambio operatore + payment_method 'misto'
-- ============================================================

-- 1. PIN operatore per cambio rapido nel POS bar
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bar_pin TEXT;

-- 2. Aggiorna check constraint su payment_method per includere 'misto'
-- (il campo è già TEXT senza constraint rigido, niente da fare)
