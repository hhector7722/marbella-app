-- Allow 'supervisor' (and 'admin') as valid roles in public.profiles.
-- Needed because UI/RLS already uses these roles.

alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array['manager','staff','chef','supervisor','admin']));

