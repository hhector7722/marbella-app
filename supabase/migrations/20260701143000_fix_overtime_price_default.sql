-- Fix: Make overtime_price_snapshot default to NULL so fn_worker_effective_overtime_rate 
-- can fall back to the profile's overtime rate correctly.

ALTER TABLE public.weekly_snapshots ALTER COLUMN overtime_price_snapshot DROP DEFAULT;
ALTER TABLE public.weekly_snapshots ALTER COLUMN overtime_price_snapshot SET DEFAULT NULL;

-- Set existing 0 to NULL so they pull from profile, unless they were explicitly set to 0.
-- Since the system was defaulting to 0 for all auto-generated snapshots, 0 is effectively "unset".
UPDATE public.weekly_snapshots SET overtime_price_snapshot = NULL WHERE overtime_price_snapshot = 0;

NOTIFY pgrst, 'reload schema';
