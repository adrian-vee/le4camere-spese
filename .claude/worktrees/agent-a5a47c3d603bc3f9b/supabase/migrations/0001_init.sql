-- =====================================================================
-- Le 4 Camere · Gestione Spese — Schema iniziale
-- Eseguire nel SQL Editor di Supabase (o via `supabase db push`).
-- =====================================================================

-- ---------- Estensioni ----------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- =====================================================================
-- PROFILES (un record per utente autenticato)
-- =====================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- Crea automaticamente il profilo alla registrazione di un nuovo utente
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- CATEGORIE
-- =====================================================================
create table if not exists public.categories (
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique,
  color  text not null default '#9C8E78',
  sort   int  not null default 100
);

insert into public.categories (name, color, sort) values
  ('Manutenzione',                '#A8552F', 10),
  ('Pulizie / Lavanderia',        '#5C7363', 20),
  ('Forniture / Consumabili',     '#B68A3E', 30),
  ('Colazione / Alimentari',      '#C77B4A', 40),
  ('Utenze (luce/gas/acqua)',     '#7A6A8C', 50),
  ('Internet / Telefono',         '#4F7B8C', 60),
  ('Tasse / Imposte',             '#9E3B2E', 70),
  ('Imposta di soggiorno',        '#B0653A', 75),
  ('Commissioni OTA',             '#C25E8C', 80),
  ('Assicurazioni',               '#6B7B4F', 90),
  ('Attrezzature',                '#8A7355', 100),
  ('Altro',                       '#9C8E78', 999)
on conflict (name) do nothing;

-- =====================================================================
-- FORNITORI
-- =====================================================================
create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  vat         text,
  notes       text,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- SPESE
-- =====================================================================
create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  amount          numeric(12,2) not null check (amount >= 0),
  expense_date    date not null default current_date,
  category_id     uuid references public.categories(id) on delete set null,
  supplier_id     uuid references public.suppliers(id) on delete set null,
  supplier_name   text,                       -- inserimento rapido senza anagrafica
  doc_type        text not null default 'Scontrino',  -- Scontrino | Fattura | Bolla/DDT | Ricevuta | Altro
  payment_method  text not null default 'Carta',      -- Contanti | Carta | Bonifico | Altro
  payment_status  text not null default 'pagato',     -- pagato | da_pagare
  due_date        date,                       -- scadenza se da_pagare
  cost_center     text,                       -- Camere | Colazione | Aree comuni | Generale ...
  notes           text,
  document_path   text,                       -- path nel bucket Storage 'documenti'
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists expenses_date_idx     on public.expenses (expense_date desc);
create index if not exists expenses_category_idx on public.expenses (category_id);
create index if not exists expenses_status_idx   on public.expenses (payment_status);

-- updated_at automatico
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch
  before update on public.expenses
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- RLS — tutti gli utenti AUTENTICATI inseriscono/leggono liberamente
-- (nessun workflow di approvazione, come da scelta progettuale)
-- =====================================================================
alter table public.profiles   enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers  enable row level security;
alter table public.expenses   enable row level security;

-- profiles: ognuno legge tutti (per mostrare "inserito da"), modifica solo il proprio
create policy "profiles_read"   on public.profiles for select to authenticated using (true);
create policy "profiles_update" on public.profiles for update to authenticated using (auth.uid() = id);

-- categorie: lettura/scrittura per autenticati
create policy "categories_read"  on public.categories for select to authenticated using (true);
create policy "categories_write" on public.categories for all    to authenticated using (true) with check (true);

-- fornitori: lettura/scrittura per autenticati
create policy "suppliers_all" on public.suppliers for all to authenticated using (true) with check (true);

-- spese: lettura/scrittura per autenticati
create policy "expenses_all" on public.expenses for all to authenticated using (true) with check (true);

-- =====================================================================
-- STORAGE — bucket privato 'documenti' per scontrini/fatture/bolle
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('documenti', 'documenti', false)
on conflict (id) do nothing;

create policy "documenti_read"   on storage.objects for select to authenticated using (bucket_id = 'documenti');
create policy "documenti_insert" on storage.objects for insert to authenticated with check (bucket_id = 'documenti');
create policy "documenti_update" on storage.objects for update to authenticated using (bucket_id = 'documenti');
create policy "documenti_delete" on storage.objects for delete to authenticated using (bucket_id = 'documenti');
