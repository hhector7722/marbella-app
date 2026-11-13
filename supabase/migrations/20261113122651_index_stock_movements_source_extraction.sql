-- Índice del proceso de conciliación de albaranes.
-- Aplicado en producción de forma concurrente el 13-11-2026.
-- Esta migración conserva el esquema en instalaciones nuevas y es idempotente
-- para producción, donde el índice ya existe.
CREATE INDEX IF NOT EXISTS idx_stock_movements_source_extraction_present
  ON public.stock_movements USING btree (source_document_extraction_id)
  WHERE source_document_extraction_id IS NOT NULL;
