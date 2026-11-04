-- Aviso semanal por proveedor: la semana empieza el lunes en Europe/Madrid.
-- Solo cuenta pedidos con dispatched_at: crear el PDF no equivale a tramitar.
CREATE OR REPLACE FUNCTION public.supplier_last_dispatched_order_this_week(p_supplier_id text)
RETURNS TABLE (dispatched boolean, first_name text, dispatched_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_monday date;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_supplier_id IS NULL OR btrim(p_supplier_id) = '' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  v_monday := (now() AT TIME ZONE 'Europe/Madrid')::date
              - (EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Europe/Madrid')::date)::int - 1);
  v_start := v_monday::timestamp AT TIME ZONE 'Europe/Madrid';
  -- Convertir ambos límites desde la hora local evita errores al cambiar de horario.
  v_end := (v_monday + 7)::timestamp AT TIME ZONE 'Europe/Madrid';

  RETURN QUERY
  SELECT
    true,
    NULLIF(btrim(pr.first_name), ''),
    po.dispatched_at
  FROM public.purchase_orders po
  LEFT JOIN public.profiles pr ON pr.id = po.created_by
  WHERE po.supplier_id = p_supplier_id
    AND po.dispatched_at >= v_start
    AND po.dispatched_at < v_end
  ORDER BY po.dispatched_at DESC, po.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.supplier_last_dispatched_order_this_week(text) IS
  'Último pedido tramitado del proveedor en la semana lunes-domingo Europe/Madrid, con primer nombre y fecha. No devuelve importes ni líneas.';

REVOKE ALL ON FUNCTION public.supplier_last_dispatched_order_this_week(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_last_dispatched_order_this_week(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.supplier_last_dispatched_order_this_week(text) TO authenticated;
