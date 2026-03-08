-- ============================================================
-- Permitir event_type 'no_registered' en time_logs
-- Uso exclusivo manager: día sin fichaje → tipo "No registrado" (cruz roja).
-- ============================================================

-- Eliminar CHECK existente sobre event_type (si existe)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
    WHERE c.conrelid = 'public.time_logs'::regclass
      AND c.contype = 'c'
      AND a.attname = 'event_type'
  LOOP
    EXECUTE format('ALTER TABLE public.time_logs DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- Añadir CHECK con el nuevo valor permitido
ALTER TABLE public.time_logs
ADD CONSTRAINT time_logs_event_type_check
CHECK (event_type IN (
  'regular',
  'overtime',
  'weekend',
  'holiday',
  'personal',
  'adjustment',
  'no_registered'
));

COMMENT ON COLUMN public.time_logs.event_type IS 'Tipo de fichaje. no_registered = día sin fichaje (solo manager). Opciones y checkbox "No registrada" son de uso exclusivo manager.';
