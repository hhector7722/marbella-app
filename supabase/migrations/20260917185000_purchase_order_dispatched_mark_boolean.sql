DROP FUNCTION IF EXISTS public.mark_purchase_order_dispatched(uuid);

CREATE FUNCTION public.mark_purchase_order_dispatched(p_order_id uuid)
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

REVOKE ALL ON FUNCTION public.mark_purchase_order_dispatched(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_purchase_order_dispatched(uuid) TO authenticated;
