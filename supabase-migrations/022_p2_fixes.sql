-- ============================================================
-- 022: P2 audit fixes
-- ============================================================

-- P2-11: Distinzione biancheria / consumabili in housekeeping
ALTER TABLE room_consumables ADD COLUMN IF NOT EXISTS is_consumable BOOLEAN DEFAULT TRUE;
COMMENT ON COLUMN room_consumables.is_consumable IS 'FALSE per biancheria (noleggio, non scaricata dal magazzino)';
