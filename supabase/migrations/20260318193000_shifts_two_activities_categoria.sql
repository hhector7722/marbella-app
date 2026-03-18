-- Horarios: soporte para 2 actividades por día + categoría de participantes
-- Slot 1 (actividad existente): se añaden categoría + borrador de categoría
-- Slot 2: nuevos campos actividad/inicio/final/participantes/categoría

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS categoria text;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS draft_categoria text;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS activity_2 text;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS draft_activity_2 text;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS event_start_time_2 text;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS event_end_time_2 text;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS event_participants_2 integer;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS categoria_2 text;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS draft_categoria_2 text;

