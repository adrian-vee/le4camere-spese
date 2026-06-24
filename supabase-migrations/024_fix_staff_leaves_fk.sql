-- Fix staff_leaves.staff_id FK: was referencing staff(id) but the app stores profiles.id
ALTER TABLE public.staff_leaves
  DROP CONSTRAINT IF EXISTS staff_leaves_staff_id_fkey;

ALTER TABLE public.staff_leaves
  ADD CONSTRAINT staff_leaves_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.profiles(id);
