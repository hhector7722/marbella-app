DROP FUNCTION IF EXISTS public.supplier_has_dispatched_order_today(text);

CREATE FUNCTION public.supplier_has_dispatched_order_today(p_supplier_id text)
RETURNS TABLE (dispatched boolean, first_name text)
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
    RETURN QUERY SELECT false, NULL::text;
    RETURN;
  END IF;

  v_start := ((timezone('Europe/Madrid', now()))::date)::timestamp AT TIME ZONE 'Europe/Madrid';
  v_end := v_start + interval '1 day';

  RETURN QUERY
  SELECT
    true,
    NULLIF(btrim(pr.first_name), '')
  FROM public.purchase_orders po
  LEFT JOIN public.profiles pr ON pr.id = po.created_by
  WHERE po.supplier_id = p_supplier_id
    AND po.dispatched_at IS NOT NULL
    AND po.dispatched_at >= v_start
    AND po.dispatched_at < v_end
  ORDER BY po.dispatched_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.supplier_has_dispatched_order_today(text) IS
  'Si el proveedor ya tiene un pedido tramitado hoy (Europe/Madrid), devuelve true y el first_name operativo de quien lo hizo. Sin líneas ni importes.';

REVOKE ALL ON FUNCTION public.supplier_has_dispatched_order_today(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_has_dispatched_order_today(text) TO authenticated;
