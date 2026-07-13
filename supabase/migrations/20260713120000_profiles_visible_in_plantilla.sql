-- Visibilidad manual en el selector de Plantilla (independiente de end_date).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS visible_in_plantilla boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.visible_in_plantilla IS
  'Si es true, el trabajador aparece en el selector de Plantilla. Gestionable con toggle en "Ver todos"; no depende de end_date.';

-- Estado inicial coherente con el comportamiento anterior: bajas ocultas por defecto.
UPDATE public.profiles
SET visible_in_plantilla = false
WHERE end_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_visible_in_plantilla
  ON public.profiles (visible_in_plantilla)
  WHERE visible_in_plantilla = true;
