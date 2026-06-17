-- =====================================================================
-- Smoobu integration + Housekeeping enhancements
-- =====================================================================

-- Add Smoobu apartment ID to rooms for mapping
alter table public.rooms add column if not exists smoobu_apartment_id bigint unique;

-- Add Smoobu-sourced fields to housekeeping_tasks
alter table public.housekeeping_tasks add column if not exists guest_name text;
alter table public.housekeeping_tasks add column if not exists channel text;
alter table public.housekeeping_tasks add column if not exists check_in_date date;
alter table public.housekeeping_tasks add column if not exists check_out_date date;
alter table public.housekeeping_tasks add column if not exists nights int;
alter table public.housekeeping_tasks add column if not exists occupancy_status text default 'vacant'
  check (occupancy_status in ('checkout', 'stayover', 'vacant'));

-- Index for faster date lookups
create index if not exists idx_hk_tasks_date on public.housekeeping_tasks (task_date);
create index if not exists idx_rooms_smoobu on public.rooms (smoobu_apartment_id) where smoobu_apartment_id is not null;
