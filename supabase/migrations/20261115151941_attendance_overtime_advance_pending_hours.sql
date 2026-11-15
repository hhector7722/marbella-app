-- Proyección C del anticipo monetario traducido a horas para Asistencia.
-- Es crédito de apertura: se muestra también durante la semana que lo compensa.
-- No cambia el carry de horas, el importe a pagar ni los hechos B de pago.
ALTER TABLE public.weekly_snapshots
  ADD COLUMN IF NOT EXISTS overtime_advance_pending_hours numeric(10,2)
  NOT NULL DEFAULT 0
  CONSTRAINT weekly_snapshots_overtime_advance_pending_hours_nonnegative
  CHECK (overtime_advance_pending_hours >= 0);

COMMENT ON COLUMN public.weekly_snapshots.overtime_advance_pending_hours IS
  'Horas equivalentes al anticipo monetario de extras pendiente al inicio de la semana; resultado C del Writer para el histórico de Asistencia.';

ALTER TABLE public.weekly_snapshots
  ADD COLUMN IF NOT EXISTS overtime_advance_compensated_hours numeric(10,2)
  NOT NULL DEFAULT 0
  CONSTRAINT weekly_snapshots_overtime_advance_compensated_hours_nonnegative
  CHECK (overtime_advance_compensated_hours >= 0);

COMMENT ON COLUMN public.weekly_snapshots.overtime_advance_compensated_hours IS
  'Horas extras de la semana compensadas con un anticipo monetario previo; proyección C. No altera las horas físicas trabajadas.';
