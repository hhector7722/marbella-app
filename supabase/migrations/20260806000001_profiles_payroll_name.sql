-- migration to add payroll_name to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS payroll_name text NULL;
