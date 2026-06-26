-- Privacy consents tracking table
create table if not exists public.privacy_consents (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid unique references public.staff(id) on delete cascade,
  profile_id      uuid references auth.users(id) on delete cascade,
  accept_token    uuid,
  token_expires_at timestamptz,
  email_sent_at   timestamptz,
  consent_given   boolean not null default false,
  consent_date    timestamptz,
  accepted_via    text,  -- 'carta' | 'email' | 'diretto'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_privacy_consents_profile on public.privacy_consents(profile_id);
create index if not exists idx_privacy_consents_token on public.privacy_consents(accept_token);

alter table public.privacy_consents enable row level security;

-- Admin/manager can read all consents
create policy "privacy_consents_select" on public.privacy_consents
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'manager')
    )
    or profile_id = auth.uid()
  );

-- Admin can insert consents
create policy "privacy_consents_insert" on public.privacy_consents
  for insert with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Admin can update consents
create policy "privacy_consents_update" on public.privacy_consents
  for update using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
