-- Albaranes / ledger: varios entornos tenían `stock_movements` sin la columna
-- `reference_doc`, lo que rompe DELETE de albarán, unmap y filtros PostgREST.
-- Idempotente: no falla si la columna ya existe (p. ej. schema_dump del repo).

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS reference_doc character varying(255);

COMMENT ON COLUMN public.stock_movements.reference_doc IS
  'Idempotencia y trazabilidad: ALB-LINE-<uuid>, TICKET-…, STAFF-…, REFUND-…, WASTE-…, etc.';

CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_doc
  ON public.stock_movements (reference_doc)
  WHERE reference_doc IS NOT NULL;
