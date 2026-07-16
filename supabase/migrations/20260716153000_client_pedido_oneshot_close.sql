BEGIN;

-- Tras el envío del cliente: cerrar edición por enlace (one-shot).
-- El token se conserva para mostrar la pantalla «Pedido enviado» al reabrir.

CREATE OR REPLACE FUNCTION public.save_client_event_order_by_token(
  p_token uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_event_name text;
  v_event_date date;
  v_event_time time;
  v_event_active boolean;
  v_enabled_ids text[];
  v_client_edit boolean;
  v_event_ts timestamptz;

  v_order_id uuid;
  v_responsible text;
  v_total numeric := 0;
  v_item jsonb;
  v_pid text;
  v_qty integer;
  v_name text;
  v_price numeric;
  v_category text;
  v_items_out jsonb := '[]'::jsonb;
  v_any boolean := false;

  y int;
  mo int;
  d int;
  hh int;
  mi int;
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_requerido');
  END IF;

  SELECT
    e.id, e.name, e.event_date, e.event_time, e.is_active,
    e.enabled_product_ids, e.client_edit_enabled
  INTO
    v_event_id, v_event_name, v_event_date, v_event_time, v_event_active,
    v_enabled_ids, v_client_edit
  FROM public.events e
  WHERE e.client_edit_token = p_token
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_client_edit IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'error', 'client_edit_disabled');
  END IF;

  IF v_event_active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_inactive');
  END IF;

  y := EXTRACT(YEAR FROM v_event_date)::int;
  mo := EXTRACT(MONTH FROM v_event_date)::int;
  d := EXTRACT(DAY FROM v_event_date)::int;
  hh := EXTRACT(HOUR FROM v_event_time)::int;
  mi := EXTRACT(MINUTE FROM v_event_time)::int;
  v_event_ts := make_timestamptz(y, mo, d, hh, mi, 0, 'Europe/Madrid');

  IF v_event_ts < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_past');
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'items_invalidos';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := trim(coalesce(v_item->>'product_id', ''));
    v_qty := NULLIF(trim(coalesce(v_item->>'quantity', '')), '')::int;

    IF v_pid = '' THEN
      RAISE EXCEPTION 'product_id_requerido';
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'quantity_invalida';
    END IF;

    IF v_enabled_ids IS NOT NULL AND NOT (v_pid = ANY(v_enabled_ids)) THEN
      RAISE EXCEPTION 'producto_no_permitido: %', v_pid;
    END IF;

    SELECT rp.name, rp.price, rp.category
    INTO v_name, v_price, v_category
    FROM public.fn_resolve_event_order_product(v_pid) rp
    LIMIT 1;

    IF v_name IS NULL OR v_name = '' OR v_price IS NULL THEN
      RAISE EXCEPTION 'producto_no_disponible: %', v_pid;
    END IF;

    INSERT INTO public.event_products (product_id, name, price, category, is_active)
    VALUES (v_pid, v_name, v_price, v_category, true)
    ON CONFLICT (product_id) DO UPDATE SET
      name = EXCLUDED.name,
      price = EXCLUDED.price,
      category = COALESCE(EXCLUDED.category, public.event_products.category),
      is_active = true,
      updated_at = now();

    v_any := true;
    v_total := v_total + (v_price * v_qty);
    v_items_out := v_items_out || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_pid,
        'name', v_name,
        'quantity', v_qty,
        'unit_price', v_price
      )
    );
  END LOOP;

  IF v_any IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'items_vacios';
  END IF;

  v_responsible := coalesce(nullif(trim(v_event_name), ''), 'Cliente');

  SELECT o.id INTO v_order_id
  FROM public.event_orders o
  WHERE o.event_id = v_event_id
    AND o.status IN ('pending', 'confirmed')
  ORDER BY
    CASE WHEN o.status = 'confirmed' THEN 0 ELSE 1 END,
    o.created_at ASC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    INSERT INTO public.event_orders (event_id, responsible_name, items, total_amount, notes, status)
    VALUES (
      v_event_id,
      v_responsible,
      v_items_out,
      v_total,
      NULLIF(trim(coalesce(p_notes, '')), ''),
      'pending'
    )
    RETURNING id INTO v_order_id;
  ELSE
    UPDATE public.event_orders
    SET
      items = v_items_out,
      total_amount = v_total,
      notes = COALESCE(NULLIF(trim(coalesce(p_notes, '')), ''), notes),
      responsible_name = v_responsible,
      status = 'pending'
    WHERE id = v_order_id;
  END IF;

  -- One-shot: el cliente ya no puede modificar por este enlace.
  UPDATE public.events
  SET client_edit_enabled = false, updated_at = now()
  WHERE id = v_event_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_order_id,
    'event_id', v_event_id,
    'responsible_name', v_responsible,
    'items', v_items_out,
    'total_amount', v_total,
    'status', 'pending',
    'client_edit_closed', true
  );
END;
$$;

COMMIT;
