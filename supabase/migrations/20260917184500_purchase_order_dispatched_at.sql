-- Un pedido a proveedor se considera tramitado al pulsar Descargar, Enviar o
-- Proveedor. Generar el PDF no basta. El aviso del día en curso consulta este
-- sello, no created_at.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;

COMMENT ON COLUMN public.purchase_orders.dispatched_at IS
  'Instante en que el pedido se tramitó al pulsar Descargar, Enviar o Proveedor. NULL = aún no tramitado.';

CREATE INDEX IF NOT EXISTS purchase_orders_supplier_dispatched_at_idx
  ON public.purchase_orders (supplier_id, dispatched_at)
  WHERE dispatched_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mark_purchase_order_dispatched(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Pedido no indicado';
  END IF;

  UPDATE public.purchase_orders
  SET dispatched_at = COALESCE(dispatched_at, now())
  WHERE id = p_order_id
    AND (
      created_by = auth.uid()
      OR public.is_purchase_manager_or_admin()
    );

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.mark_purchase_order_dispatched(uuid) IS
  'Sella dispatched_at la primera vez que se pulsa Descargar, Enviar o Proveedor. Solo el autor o un manager de compras.';

CREATE OR REPLACE FUNCTION public.supplier_has_dispatched_order_today(p_supplier_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_supplier_id IS NULL OR btrim(p_supplier_id) = '' THEN
    RETURN false;
  END IF;

  v_start := ((timezone('Europe/Madrid', now()))::date)::timestamp AT TIME ZONE 'Europe/Madrid';
  v_end := v_start + interval '1 day';

  RETURN EXISTS (
    SELECT 1
    FROM public.purchase_orders
    WHERE supplier_id = p_supplier_id
      AND dispatched_at IS NOT NULL
      AND dispatched_at >= v_start
      AND dispatched_at < v_end
  );
END;
$$;

COMMENT ON FUNCTION public.supplier_has_dispatched_order_today(text) IS
  'True si el proveedor ya tiene un pedido tramitado en el día civil Europe/Madrid. No devuelve líneas ni importes.';

REVOKE ALL ON FUNCTION public.mark_purchase_order_dispatched(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_has_dispatched_order_today(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_purchase_order_dispatched(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_has_dispatched_order_today(text) TO authenticated;
