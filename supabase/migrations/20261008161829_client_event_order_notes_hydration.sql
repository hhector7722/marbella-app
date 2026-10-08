-- El enlace privado ya autoriza a leer el pedido mientras siga abierto.
-- Devuelve también las indicaciones generales para editarlas al reabrirlo.
CREATE OR REPLACE FUNCTION public.get_client_event_order_items_by_token(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_edit boolean;
  v_submitted timestamptz;
  v_items jsonb;
  v_notes text;
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_requerido');
  END IF;

  SELECT e.id, e.client_edit_enabled, e.client_order_submitted_at
  INTO v_event_id, v_edit, v_submitted
  FROM public.events e
  WHERE e.client_edit_token = p_token
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_edit IS DISTINCT FROM true OR v_submitted IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'items', '[]'::jsonb, 'notes', '');
  END IF;

  SELECT o.items, o.notes
  INTO v_items, v_notes
  FROM public.event_orders o
  WHERE o.event_id = v_event_id
    AND o.status IN ('pending', 'confirmed')
  ORDER BY
    CASE WHEN o.status = 'confirmed' THEN 0 ELSE 1 END,
    CASE WHEN jsonb_array_length(coalesce(o.items, '[]'::jsonb)) > 0 THEN 0 ELSE 1 END,
    o.created_at ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'items', coalesce(v_items, '[]'::jsonb),
    'notes', coalesce(v_notes, '')
  );
END;
$$;

COMMENT ON FUNCTION public.get_client_event_order_items_by_token(uuid) IS
  'Devuelve líneas e indicaciones del pedido primario para hidratar el carrito cliente abierto.';
