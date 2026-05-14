-- Borrar movimientos vinculados a albarán **sin** filtros PostgREST sobre `reference_doc`.
-- Motivos:
-- 1) Tras ADD COLUMN, la API puede seguir respondiendo "column does not exist" hasta reload de esquema.
-- 2) RLS en `stock_movements` (p. ej. DELETE solo manager vía JWT) puede bloquear el `.delete()` del cliente
--    aunque `profiles.role` sea correcto si `current_employee_role()` no coincide.
-- Solo `manager` / `admin` en `public.profiles` (alineado con `deletePurchaseInvoiceAction` en app).

CREATE OR REPLACE FUNCTION public.delete_stock_movements_for_purchase_invoice(p_invoice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('manager', 'admin')
  ) THEN
    RAISE EXCEPTION 'Solo manager o admin pueden borrar stock de albarán'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_movements'
      AND column_name = 'reference_doc'
  ) THEN
    ALTER TABLE public.stock_movements
      ADD COLUMN reference_doc character varying(255);
  END IF;

  DELETE FROM public.stock_movements sm
  USING public.purchase_invoice_lines pil
  WHERE pil.invoice_id = p_invoice_id
    AND (
      sm.reference_doc = ('ALB-LINE-' || pil.id::text)
      OR sm.reference_doc ILIKE ('ALB-LINE-' || pil.id::text || '-REV%')
    );

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_stock_movements_for_albaran_line(p_line_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('manager', 'admin')
  ) THEN
    RAISE EXCEPTION 'Solo manager o admin pueden borrar stock de línea de albarán'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_movements'
      AND column_name = 'reference_doc'
  ) THEN
    ALTER TABLE public.stock_movements
      ADD COLUMN reference_doc character varying(255);
  END IF;

  DELETE FROM public.stock_movements
  WHERE reference_doc = ('ALB-LINE-' || p_line_id::text)
     OR reference_doc ILIKE ('ALB-LINE-' || p_line_id::text || '-REV%');

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

ALTER FUNCTION public.delete_stock_movements_for_purchase_invoice(uuid) OWNER TO postgres;
ALTER FUNCTION public.delete_stock_movements_for_albaran_line(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.delete_stock_movements_for_purchase_invoice(uuid) IS
  'DELETE idempotente de stock_movements ALB-LINE-* para todas las líneas de un albarán; solo manager/admin.';
COMMENT ON FUNCTION public.delete_stock_movements_for_albaran_line(uuid) IS
  'DELETE idempotente de stock_movements ALB-LINE-<lineId> y rectificaciones REV%; solo manager/admin.';

REVOKE ALL ON FUNCTION public.delete_stock_movements_for_purchase_invoice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_stock_movements_for_albaran_line(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_stock_movements_for_purchase_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_stock_movements_for_albaran_line(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_stock_movements_for_purchase_invoice(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_stock_movements_for_albaran_line(uuid) TO service_role;
