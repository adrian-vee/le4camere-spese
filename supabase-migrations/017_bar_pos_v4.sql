-- 017: Bar POS v4 — Ritocchi Finali
-- Adds: original_total, amount_received, change_given to bar_orders

ALTER TABLE bar_orders
  ADD COLUMN IF NOT EXISTS original_total numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_received numeric(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS change_given numeric(10,2) DEFAULT NULL;
