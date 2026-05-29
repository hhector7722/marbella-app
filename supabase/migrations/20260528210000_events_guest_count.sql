-- Encargos: número de personas del grupo
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS guest_count integer;

COMMENT ON COLUMN public.events.guest_count IS 'Número de personas del encargo (grupo).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_guest_count_positive'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_guest_count_positive
      CHECK (guest_count IS NULL OR guest_count > 0);
  END IF;
END $$;
