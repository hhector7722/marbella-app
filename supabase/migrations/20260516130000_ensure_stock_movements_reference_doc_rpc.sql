-- Invocable desde server actions (rol authenticated): asegura la columna que PostgREST
-- necesita para filtros/DELETE por `reference_doc` (albaranes, rectificaciones, etc.).

CREATE OR REPLACE FUNCTION public.ensure_stock_movements_reference_doc_column()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_movements'
      AND column_name = 'reference_doc'
  ) THEN
    ALTER TABLE public.stock_movements
      ADD COLUMN reference_doc character varying(255);
  END IF;
END;
$$;

ALTER FUNCTION public.ensure_stock_movements_reference_doc_column() OWNER TO postgres;

COMMENT ON FUNCTION public.ensure_stock_movements_reference_doc_column() IS
  'Idempotente: añade stock_movements.reference_doc si falta (entornos sin migración completa).';

REVOKE ALL ON FUNCTION public.ensure_stock_movements_reference_doc_column() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_stock_movements_reference_doc_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_stock_movements_reference_doc_column() TO service_role;
