-- Pedido: ración 1/2 = mismo product_id TPV + is_half (precio override_precio_medio).
-- Actualiza save_client_event_order_by_token, create_staff_event_order, update_staff_event_order.

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
  v_submitted_at timestamptz;
  v_reservation_id uuid;
  v_guest_count integer;
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
  v_base_name text;
  v_base_price numeric;
  v_is_half boolean;
  v_line_notes text;
  v_half_notes text;
  v_items_out jsonb := '[]'::jsonb;
  v_any boolean := false;
  v_body text;
  v_date_line text;
  v_kind_line text;
  y int; mo int; d int; hh int; mi int;
  v_dow int;
  v_mon int;
  v_day_name text;
  v_mon_name text;
BEGIN
  IF p_token IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'token_requerido'); END IF;

  SELECT e.id, e.name, e.event_date, e.event_time, e.is_active,
    e.enabled_product_ids, e.client_edit_enabled, e.client_order_submitted_at,
    e.reservation_id, e.guest_count
  INTO v_event_id, v_event_name, v_event_date, v_event_time, v_event_active,
    v_enabled_ids, v_client_edit, v_submitted_at,
    v_reservation_id, v_guest_count
  FROM public.events e WHERE e.client_edit_token = p_token LIMIT 1;

  IF v_event_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_submitted_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'already_submitted'); END IF;
  IF v_client_edit IS DISTINCT FROM true THEN RETURN jsonb_build_object('ok', false, 'error', 'client_edit_disabled'); END IF;
  IF v_event_active IS DISTINCT FROM true THEN RETURN jsonb_build_object('ok', false, 'error', 'event_inactive'); END IF;

  y := EXTRACT(YEAR FROM v_event_date)::int;
  mo := EXTRACT(MONTH FROM v_event_date)::int;
  d := EXTRACT(DAY FROM v_event_date)::int;
  hh := EXTRACT(HOUR FROM v_event_time)::int;
  mi := EXTRACT(MINUTE FROM v_event_time)::int;
  v_event_ts := make_timestamptz(y, mo, d, hh, mi, 0, 'Europe/Madrid');
  IF v_event_ts < now() THEN RETURN jsonb_build_object('ok', false, 'error', 'event_past'); END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'items_invalidos'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := trim(coalesce(v_item->>'product_id', ''));
    v_qty := NULLIF(trim(coalesce(v_item->>'quantity', '')), '')::int;
    v_line_notes := NULLIF(trim(coalesce(v_item->>'notes', '')), '');
    v_is_half := coalesce((v_item->>'is_half')::boolean, false)
      OR lower(coalesce(v_line_notes, '')) IN ('1/2', '½', 'medio', 'mitad', 'half');

    IF v_pid = '' THEN RAISE EXCEPTION 'product_id_requerido'; END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'quantity_invalida'; END IF;
    IF v_enabled_ids IS NOT NULL AND NOT (v_pid = ANY(v_enabled_ids)) THEN
      RAISE EXCEPTION 'producto_no_permitido: %', v_pid;
    END IF;

    SELECT rp.name, rp.price, rp.category INTO v_name, v_price, v_category
    FROM public.fn_resolve_event_order_product(v_pid) rp LIMIT 1;
    IF v_name IS NULL OR v_name = '' OR v_price IS NULL THEN
      RAISE EXCEPTION 'producto_no_disponible: %', v_pid;
    END IF;

    v_base_name := v_name;
    v_base_price := v_price;

    INSERT INTO public.event_products (product_id, name, price, category, is_active)
    VALUES (v_pid, v_base_name, v_base_price, v_category, true)
    ON CONFLICT (product_id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price,
      category = COALESCE(EXCLUDED.category, public.event_products.category),
      is_active = true, updated_at = now();

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
  v_responsible := coalesce(nullif(trim(v_event_name), ''), 'Cliente');

  SELECT o.id INTO v_order_id FROM public.event_orders o
  WHERE o.event_id = v_event_id AND o.status IN ('pending', 'confirmed')
  ORDER BY CASE WHEN o.status = 'confirmed' THEN 0 ELSE 1 END, o.created_at ASC LIMIT 1;

  IF v_order_id IS NULL THEN
    INSERT INTO public.event_orders (event_id, responsible_name, items, total_amount, notes, status)
    VALUES (v_event_id, v_responsible, v_items_out, v_total, NULLIF(trim(coalesce(p_notes, '')), ''), 'pending')
    RETURNING id INTO v_order_id;
  ELSE
    UPDATE public.event_orders SET items = v_items_out, total_amount = v_total,
      notes = COALESCE(NULLIF(trim(coalesce(p_notes, '')), ''), notes),
      responsible_name = v_responsible, status = 'pending'
    WHERE id = v_order_id;
  END IF;

  UPDATE public.events SET
    client_edit_enabled = false,
    client_order_submitted_at = now(),
    filled_by = COALESCE(filled_by, 'client'),
    updated_at = now()
  WHERE id = v_event_id;

  v_dow := EXTRACT(DOW FROM v_event_date)::int;
  v_mon := EXTRACT(MONTH FROM v_event_date)::int;
  v_day_name := CASE v_dow
    WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes' WHEN 3 THEN 'Miércoles'
    WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes' ELSE 'Sábado'
  END;
  v_mon_name := CASE v_mon
    WHEN 1 THEN 'enero' WHEN 2 THEN 'febrero' WHEN 3 THEN 'marzo' WHEN 4 THEN 'abril'
    WHEN 5 THEN 'mayo' WHEN 6 THEN 'junio' WHEN 7 THEN 'julio' WHEN 8 THEN 'agosto'
    WHEN 9 THEN 'septiembre' WHEN 10 THEN 'octubre' WHEN 11 THEN 'noviembre' ELSE 'diciembre'
  END;
  v_date_line := v_day_name || ' ' || d::text || ' ' || v_mon_name
    || ' · ' || lpad(hh::text, 2, '0') || ':' || lpad(mi::text, 2, '0');
  v_kind_line := CASE
    WHEN v_reservation_id IS NOT NULL THEN 'Reserva con pedido'
    ELSE 'Pedido'
  END;
  v_body := trim(coalesce(v_event_name, 'Cliente'))
    || E'\n' || v_date_line
    || E'\n' || v_kind_line;

  INSERT INTO public.user_notifications (
    user_id, type, title, body, action_url, entity_type, entity_id
  )
  SELECT
    p.id,
    'client_order_submitted',
    'Nuevo pedido recibido',
    v_body,
    '/staff/reservas?eventId=' || v_event_id::text,
    'event',
    v_event_id
  FROM public.profiles p
  WHERE lower(trim(p.first_name)) IN (
    'alba',
    'hernan',
    'pere',
    'hector'
  );

  RETURN jsonb_build_object(
    'ok', true, 'id', v_order_id, 'event_id', v_event_id,
    'responsible_name', v_responsible, 'items', v_items_out,
    'total_amount', v_total, 'status', 'pending',
    'client_edit_closed', true, 'client_order_submitted', true
  );
END;
$$;

-- create_staff / update_staff también aplicados is_half (aplicado en remoto vía MCP staff_event_order_racion_medio).
-- Ver historial remoto: fn_event_order_apply_racion + create/update_staff_event_order.
