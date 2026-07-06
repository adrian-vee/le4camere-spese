-- 034_controls_ricevuta.sql
-- Aggiunge il campo ricevuta_url alla tabella controls
-- per allegare la ricevuta del prelievo (una per controllo).
ALTER TABLE controls ADD COLUMN IF NOT EXISTS ricevuta_url text;
