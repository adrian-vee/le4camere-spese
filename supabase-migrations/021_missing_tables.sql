-- ============================================================
-- 021: CREATE TABLE IF NOT EXISTS for tables used in codebase
--      but missing explicit CREATE TABLE in migrations.
--      These tables were created via Supabase Dashboard or
--      earlier untracked migrations.
-- ============================================================

-- ── Products (warehouse) ──
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT DEFAULT 'Altro',
  unit TEXT DEFAULT 'pz',
  unit_cost NUMERIC(10,2) DEFAULT 0,
  vat_rate NUMERIC(5,2) DEFAULT 22,
  supplier_code TEXT,
  min_stock NUMERIC(10,2) DEFAULT 0,
  default_supplier_id UUID REFERENCES public.suppliers(id),
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  barcode TEXT,
  expiry_date DATE,
  tracking_type TEXT DEFAULT 'units' CHECK (tracking_type IN ('units', 'bottle')),
  bottle_capacity_ml NUMERIC(10,2),
  standard_pour_ml NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Stock Movements ──
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  quantity NUMERIC(10,2) NOT NULL,
  notes TEXT,
  expiry_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Product Batches (bottle tracking) ──
CREATE TABLE IF NOT EXISTS public.product_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  is_open BOOLEAN DEFAULT FALSE,
  quantity_remaining NUMERIC(10,2) DEFAULT 0,
  fill_level INTEGER DEFAULT 10,
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Rooms ──
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INTEGER NOT NULL,
  name TEXT,
  room_type TEXT NOT NULL DEFAULT 'Matrimoniale',
  floor TEXT DEFAULT 'Piano terra',
  active BOOLEAN DEFAULT TRUE,
  smoobu_apartment_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Housekeeping Tasks ──
CREATE TABLE IF NOT EXISTS public.housekeeping_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id),
  task_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'da_pulire',
  assigned_to UUID REFERENCES public.staff(id),
  checklist JSONB DEFAULT '[]',
  notes TEXT,
  photo_path TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  inspected_by UUID REFERENCES auth.users(id),
  guest_name TEXT,
  channel TEXT,
  check_in_date DATE,
  check_out_date DATE,
  nights INTEGER,
  occupancy_status TEXT,
  stock_deducted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Room Consumables ──
CREATE TABLE IF NOT EXISTS public.room_consumables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC(10,2) DEFAULT 1,
  is_consumable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Recurring Expenses ──
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  category_id UUID REFERENCES public.categories(id),
  supplier_name TEXT,
  day_of_month INTEGER DEFAULT 1,
  frequency TEXT NOT NULL DEFAULT 'mensile',
  payment_method TEXT DEFAULT 'Bonifico',
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  last_generated DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Notifications ──
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  ref_key TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Settings ──
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Inventory Sessions ──
CREATE TABLE IF NOT EXISTS public.inventory_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  started_by UUID REFERENCES auth.users(id),
  notes TEXT,
  aligned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Inventory Counts ──
CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.inventory_sessions(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  expected_qty NUMERIC(10,2),
  counted_qty NUMERIC(10,2),
  difference NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Utility Bills ──
CREATE TABLE IF NOT EXISTS public.utility_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utility_type TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  period_start DATE,
  period_end DATE,
  due_date DATE,
  paid BOOLEAN DEFAULT FALSE,
  notes TEXT,
  document_path TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Privacy Consents ──
CREATE TABLE IF NOT EXISTS public.privacy_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  consent_type TEXT NOT NULL,
  granted BOOLEAN DEFAULT FALSE,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Staff Documents ──
CREATE TABLE IF NOT EXISTS public.staff_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id),
  title TEXT NOT NULL,
  category TEXT,
  document_path TEXT,
  expiry_date DATE,
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Staff Leaves ──
CREATE TABLE IF NOT EXISTS public.staff_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id),
  date DATE NOT NULL,
  type TEXT NOT NULL,
  period TEXT DEFAULT 'full_day',
  reason TEXT,
  status TEXT DEFAULT 'in_attesa',
  approved_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Shift Assignments ──
CREATE TABLE IF NOT EXISTS public.shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date DATE NOT NULL,
  shift_type_id UUID REFERENCES public.shift_types(id),
  staff_id UUID REFERENCES public.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Coverage Exceptions ──
CREATE TABLE IF NOT EXISTS public.coverage_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_date DATE NOT NULL,
  shift_type_id UUID REFERENCES public.shift_types(id),
  count INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Supplier Deliveries ──
CREATE TABLE IF NOT EXISTS public.supplier_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC(10,2) DEFAULT 0,
  document_type TEXT,
  document_number TEXT,
  document_path TEXT,
  expense_id UUID REFERENCES public.expenses(id),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Supplier Delivery Items ──
CREATE TABLE IF NOT EXISTS public.supplier_delivery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.supplier_deliveries(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(10,2) DEFAULT 0,
  total_cost NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Drink Prices ──
CREATE TABLE IF NOT EXISTS public.drink_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  category TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Enable RLS on new tables ──
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'products','stock_movements','product_batches','rooms','housekeeping_tasks',
    'room_consumables','recurring_expenses','notifications','settings',
    'inventory_sessions','inventory_counts','utility_bills','privacy_consents',
    'staff_documents','staff_leaves','shift_assignments','coverage_exceptions',
    'supplier_deliveries','supplier_delivery_items','drink_prices'
  ]) LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
