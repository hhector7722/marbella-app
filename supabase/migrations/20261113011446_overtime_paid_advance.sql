-- Hecho económico B, independiente del fichaje y de las proyecciones C.
-- Una semana pagada puede haber incluido un importe superior al devengo
-- recalculado: se preserva el histórico y se compensa en semanas posteriores.
ALTER TABLE public.weekly_snapshots
  ADD COLUMN IF NOT EXISTS overtime_paid_advance_eur numeric(10,2)
  NOT NULL DEFAULT 0
  CONSTRAINT weekly_snapshots_overtime_paid_advance_nonnegative
  CHECK (overtime_paid_advance_eur >= 0);

COMMENT ON COLUMN public.weekly_snapshots.overtime_paid_advance_eur IS
  'Exceso de extras ya pagado en esta semana. Hecho B inmutable por el Writer. Crédito contra extras futuras; no crea movimiento de caja.';
