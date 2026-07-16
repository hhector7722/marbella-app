-- event_orders no tiene columna updated_at (solo created_at).
-- La RPC remota fallaba al editar pedidos: column "updated_at" of relation "event_orders" does not exist.

CREATE OR REPLACE FUNCTION public.update_staff_event_order(
  p_order_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_event_id uuid;
  v_enabled_ids text[];
  v_total numeric := 0;
  v_item jsonb;
  v_pid text;
  v_qty integer;
  v_line_notes text;
  v_half_notes text;
  v_is_half boolean;
  v_name text;
  v_price numeric;
  v_category text;
  v_base_name text;
  v_base_price numeric;
  v_items_out jsonb := '[]'::jsonb;
  v_any boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no_autenticado'; END IF;
  IF NOT public.can_manage_encargos() THEN RAISE EXCEPTION 'sin_permiso'; END IF;

  SELECT o.id, o.event_id INTO v_order_id, v_event_id
  FROM public.event_orders o WHERE o.id = p_order_id LIMIT 1;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT e.enabled_product_ids INTO v_enabled_ids
  FROM public.events e WHERE e.id = v_event_id LIMIT 1;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'items_invalidos'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := trim(coalesce(v_item->>'product_id', ''));
    v_qty := NULLIF(trim(coalesce(v_item->>'quantity', '')), '')::int;
    v_line_notes := NULLIF(trim(coalesce(v_item->>'notes', '')), '');
    v_is_half := coalesce((v_item->>'is_half')::boolean, false)
      OR lower(coalesce(v_line_notes, '')) IN ('1/2', '½', 'medio', 'mitad', 'half');

    IF v_pid = '' THEN RAISE EXCEPTION 'product_id_requerido'; END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'quantity_invalida'; END IF;

    IF v_enabled_ids IS NOT NULL AND array_length(v_enabled_ids, 1) > 0 AND NOT (v_pid = ANY(v_enabled_ids)) THEN
      RAISE EXCEPTION 'producto_no_permitido: %', v_pid;
    END IF;

    v_name := NULL; v_price := NULL; v_category := NULL;

    SELECT ep.name, ep.price, ep.category INTO v_name, v_price, v_category
    FROM public.event_products ep
    WHERE ep.product_id = v_pid AND ep.is_active = true
    LIMIT 1;

    IF v_name IS NULL OR v_price IS NULL THEN
      SELECT
        trim(coalesce(v.carta_nombre, '')),
        v.precio::numeric,
        nullif(
          trim(
            both ' · '
            from concat_ws(
              ' · ',
              nullif(trim(coalesce(v.category_parent_name, '')), ''),
              nullif(trim(coalesce(v.category_child_name, '')), '')
            )
          ),
          ''
        )
      INTO v_name, v_price, v_category
      FROM public.v_staff_encargo_menu_items v
      WHERE v.articulo_id::text = v_pid
      LIMIT 1;
    END IF;

    IF v_name IS NULL OR v_name = '' OR v_price IS NULL THEN
      RAISE EXCEPTION 'producto_no_disponible: %', v_pid;
    END IF;

    v_base_name := v_name;
    v_base_price := v_price;

    INSERT INTO public.event_products (product_id, name, price, category, is_active)
    VALUES (v_pid, v_base_name, v_base_price, v_category, true)
    ON CONFLICT (product_id) DO UPDATE SET
      name = EXCLUDED.name,
      price = EXCLUDED.price,
      category = COALESCE(EXCLUDED.category, public.event_products.category),
      is_active = true,
      updated_at = now();

    SELECT a.out_name, a.out_price, a.out_notes
    INTO v_name, v_price, v_half_notes
    FROM public.fn_event_order_apply_racion(v_pid, v_base_name, v_base_price, v_is_half) a;
    v_line_notes := coalesce(v_half_notes, v_line_notes);

    v_any := true;
    v_total := v_total + (v_price * v_qty);
    v_items_out := v_items_out || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_pid,
        'name', v_name,
        'quantity', v_qty,
        'unit_price', v_price,
        'notes', v_line_notes,
        'is_half', v_is_half
      )
    );
  END LOOP;

  IF v_any IS DISTINCT FROM true THEN RAISE EXCEPTION 'items_vacios'; END IF;

  UPDATE public.event_orders
  SET items = v_items_out, total_amount = v_total
  WHERE id = v_order_id;

  UPDATE public.events
  SET filled_by = COALESCE(filled_by, 'staff'), updated_at = now()
  WHERE id = v_event_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_order_id,
    'event_id', v_event_id,
    'items', v_items_out,
    'total_amount', v_total
  );
END;
$$;
