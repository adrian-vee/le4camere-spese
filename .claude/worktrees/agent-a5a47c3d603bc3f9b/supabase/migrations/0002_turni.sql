-- =====================================================================
-- Le 4 Camere · Modulo TURNI — Schema
-- Eseguire dopo 0001_init.sql
-- =====================================================================

-- ---------- Personale ----------
create table if not exists public.staff (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            text not null default 'dipendente',  -- dipendente | a_chiamata
  hours_per_week  numeric(5,1) not null default 40,    -- 0 = nessun limite
  days_per_week   int not null default 5,              -- 0 = nessun limite (cap 6)
  role            text,                                 -- es. reception, pulizie
  active          boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now()
);

-- ---------- Fasce / mansioni (shift types) ----------
create table if not exists public.shift_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_time  time not null,
  end_time    time not null,   -- se <= start_time è notturno (giorno dopo)
  color       text not null default '#5C7363',
  sort        int not null default 100
);

insert into public.shift_types (name, start_time, end_time, color, sort) values
  ('Reception mattino',    '07:00', '14:00', '#A8552F', 10),
  ('Reception pomeriggio', '14:00', '21:00', '#B68A3E', 20),
  ('Pulizie',              '09:00', '14:00', '#5C7363', 30),
  ('Notte',                '21:00', '07:00', '#4F7B8C', 40)
on conflict do nothing;

-- ---------- Copertura settimanale (quante persone per fascia, per giorno) ----------
-- weekday: 1 = Lunedì ... 7 = Domenica (ISO)
create table if not exists public.coverage_template (
  id             uuid primary key default gen_random_uuid(),
  weekday        int not null check (weekday between 1 and 7),
  shift_type_id  uuid not null references public.shift_types(id) on delete cascade,
  count          int not null default 1 check (count >= 0),
  unique (weekday, shift_type_id)
);

-- Copertura di default: M+P+C tutti i giorni, Notte da Ven a Dom
do $$
declare st record; wd int;
begin
  for st in select id, name from public.shift_types loop
    for wd in 1..7 loop
      if st.name = 'Notte' and wd < 5 then
        continue;
      end if;
      insert into public.coverage_template (weekday, shift_type_id, count)
      values (wd, st.id, 1)
      on conflict (weekday, shift_type_id) do nothing;
    end loop;
  end loop;
end $$;

-- ---------- Turni assegnati ----------
create table if not exists public.shifts (
  id             uuid primary key default gen_random_uuid(),
  shift_date     date not null,
  shift_type_id  uuid not null references public.shift_types(id) on delete cascade,
  staff_id       uuid references public.staff(id) on delete set null,
  status         text not null default 'draft',  -- draft | confirmed
  created_at     timestamptz not null default now()
);
create index if not exists shifts_date_idx on public.shifts (shift_date);

-- ---------- Assenze / indisponibilità ----------
create table if not exists public.absences (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff(id) on delete cascade,
  absent_date date not null,
  reason     text,
  unique (staff_id, absent_date)
);

-- =====================================================================
-- RLS — utenti autenticati: accesso pieno (coerente con il modulo spese)
-- =====================================================================
alter table public.staff             enable row level security;
alter table public.shift_types       enable row level security;
alter table public.coverage_template enable row level security;
alter table public.shifts            enable row level security;
alter table public.absences          enable row level security;

create policy "staff_all"      on public.staff             for all to authenticated using (true) with check (true);
create policy "shifttypes_all" on public.shift_types       for all to authenticated using (true) with check (true);
create policy "coverage_all"   on public.coverage_template for all to authenticated using (true) with check (true);
create policy "shifts_all"     on public.shifts            for all to authenticated using (true) with check (true);
create policy "absences_all"   on public.absences          for all to authenticated using (true) with check (true);
