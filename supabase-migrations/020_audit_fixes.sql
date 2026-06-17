-- 020_audit_fixes.sql
-- P1-4: Anti-duplicate housekeeping stock deduction
ALTER TABLE housekeeping_tasks ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT FALSE;

-- P1-5: Anti-duplicate inventory alignment
ALTER TABLE inventory_sessions ADD COLUMN IF NOT EXISTS aligned BOOLEAN DEFAULT FALSE;

-- P1-3: Payment method on cash movements (contanti vs carta)
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- P1-7: Supplier ID on expenses for traceability
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);
