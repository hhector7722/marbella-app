-- Horas que computan (contrato/banco) pero no son jornada trabajada.
-- Necesario porque idx_one_shift_per_day impide un 2º time_log el mismo día.
ALTER TABLE public.time_logs
  ADD COLUMN IF NOT EXISTS justified_hours numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.time_logs.justified_hours IS
  'Horas acreditadas (examen/permiso) que suman al contrato pero no son trabajadas; no deben contar en propinas.';

ALTER TABLE public.time_logs
  DROP CONSTRAINT IF EXISTS time_logs_justified_hours_nonneg;

ALTER TABLE public.time_logs
  ADD CONSTRAINT time_logs_justified_hours_nonneg CHECK (justified_hours >= 0);
