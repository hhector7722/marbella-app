-- La captura declara cuántas hojas componen el documento antes de que el
-- procesador pueda confirmar automáticamente una recepción.
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS expected_pages integer NOT NULL DEFAULT 1
  CHECK (expected_pages BETWEEN 1 AND 20);

COMMENT ON COLUMN public.purchase_invoices.expected_pages IS
  'Número de hojas comprometidas por el escáner; las capturas históricas son una hoja salvo evidencia adicional.';
