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
-- 2. UTILITY_BILLS TABLE — ensure all columns exist
-- ============================================================
create table if not exists public.utility_bills (
  id uuid primary key default gen_random_uuid(),
  bill_type text not null check (bill_type in ('Luce','Gas','Acqua','Immondizia','Internet')),
  supplier_name text not null,
  amount numeric(12,2) not null,
  period_start date not null,
  period_end date not null,
  consumption numeric(12,4),
  consumption_unit text,
  contract_info text,
  notes text,
  file_path text,
  expense_id uuid references public.expenses(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Add columns that may be missing on an existing table
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'utility_bills' and column_name = 'contract_info'
  ) then
    alter table public.utility_bills add column contract_info text;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'utility_bills' and column_name = 'notes'
  ) then
    alter table public.utility_bills add column notes text;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'utility_bills' and column_name = 'file_path'
  ) then
    alter table public.utility_bills add column file_path text;
  end if;
end $$;

-- ============================================================
-- 3. UTILITY_SUMMARY VIEW
-- ============================================================
create or replace view public.utility_summary as
select
  bill_type,
  extract(year from period_end)::int as year,
  extract(month from period_end)::int as month,
  sum(amount) as total_cost,
  sum(consumption) as total_consumption,
  count(*) as bill_count
from public.utility_bills
group by bill_type, extract(year from period_end), extract(month from period_end);

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
