-- =====================================================================
-- Fix rooms: correct naming, floors, and Smoobu mappings
-- =====================================================================

-- Add name column for display (e.g. "Suite 1" instead of just number)
alter table public.rooms add column if not exists name text;

-- Deactivate camera 9 if it exists
update public.rooms set active = false where number = 9;

-- Fix floors for standard rooms
update public.rooms set floor = 0 where number in (1, 2, 3, 4);
update public.rooms set floor = 1 where number in (5, 6, 7, 8);
update public.rooms set floor = 2 where number in (10, 11, 12);

-- Fix suites: ensure they are on floor 2
update public.rooms set floor = 2
where (lower(type) like '%suite%' or lower(type) like '%junior%')
  and active = true;

-- Set Smoobu apartment IDs for standard rooms
update public.rooms set smoobu_apartment_id = 2978906 where number = 1 and active = true;
update public.rooms set smoobu_apartment_id = 2976281 where number = 2 and active = true;
update public.rooms set smoobu_apartment_id = 2976286 where number = 3 and active = true;
update public.rooms set smoobu_apartment_id = 2976256 where number = 4 and active = true;
update public.rooms set smoobu_apartment_id = 2977456 where number = 5 and active = true;
update public.rooms set smoobu_apartment_id = 2976261 where number = 6 and active = true;
update public.rooms set smoobu_apartment_id = 2976296 where number = 7 and active = true;
update public.rooms set smoobu_apartment_id = 2976301 where number = 8 and active = true;
update public.rooms set smoobu_apartment_id = 2976276 where number = 10 and active = true;
update public.rooms set smoobu_apartment_id = 2977466 where number = 11 and active = true;
update public.rooms set smoobu_apartment_id = 2976271 where number = 12 and active = true;

-- Set Smoobu for suites using subquery (Postgres doesn't support LIMIT in UPDATE)
-- Suite 1 (smoobu 2977461): first suite by id
update public.rooms
set smoobu_apartment_id = 2977461, type = 'Junior Suite', name = 'Suite 1', floor = 2
where id = (
  select id from public.rooms
  where active = true
    and number not in (1,2,3,4,5,6,7,8,9,10,11,12)
    and (lower(type) like '%suite%' or lower(type) like '%junior%')
  order by number, id
  limit 1
);

-- Suite 2 (smoobu 2976031): second suite by id
update public.rooms
set smoobu_apartment_id = 2976031, type = 'Junior Suite', name = 'Suite 2', floor = 2
where id = (
  select id from public.rooms
  where active = true
    and number not in (1,2,3,4,5,6,7,8,9,10,11,12)
    and (lower(type) like '%suite%' or lower(type) like '%junior%')
    and smoobu_apartment_id is distinct from 2977461
  order by number, id
  limit 1
);

-- Ensure RLS policy on rooms allows updates for authenticated users
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'rooms' and policyname = 'rooms_all'
  ) then
    execute 'alter table public.rooms enable row level security';
    execute 'create policy "rooms_all" on public.rooms for all to authenticated using (true) with check (true)';
  end if;
end $$;
