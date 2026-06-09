-- Migration: 0005_documents_utility_views
-- Idempotent: safe to re-run (IF NOT EXISTS / IF EXISTS guards everywhere)

-- ============================================================
-- 1. DOCUMENTS TABLE
-- ============================================================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Altro',
  expiry_date date,
  reminder_days int not null default 30,
  status text not null default 'attivo' check (status in ('attivo','rinnovato','archiviato')),
  notes text,
  file_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_documents_expiry on public.documents (expiry_date) where expiry_date is not null;
create index if not exists idx_documents_category on public.documents (category);

-- ============================================================
-- 2. UTILITY_BILLS TABLE — already exists, no changes needed
-- ============================================================
-- Columns: utility_type, supplier, period_start, period_end, amount,
--          consumption, unit, contract_power, contract_type, notes,
--          file_path, expense_id, created_by, created_at

-- ============================================================
-- 3. UTILITY_SUMMARY VIEW
-- ============================================================
create or replace view public.utility_summary as
select
  utility_type,
  extract(year from period_end)::int as year,
  extract(month from period_end)::int as month,
  sum(amount) as total_cost,
  sum(consumption) as total_consumption,
  count(*) as bill_count
from public.utility_bills
group by utility_type, extract(year from period_end), extract(month from period_end);

-- ============================================================
-- 4. RLS POLICIES FOR DOCUMENTS
-- ============================================================
alter table public.documents enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'documents' and policyname = 'documents_all'
  ) then
    execute 'create policy "documents_all" on public.documents for all to authenticated using (true) with check (true)';
  end if;
end $$;

-- ============================================================
-- 5. UPDATED_AT TRIGGER FOR DOCUMENTS
-- ============================================================
drop trigger if exists documents_touch on public.documents;
create trigger documents_touch
  before update on public.documents
  for each row
  execute function public.touch_updated_at();
