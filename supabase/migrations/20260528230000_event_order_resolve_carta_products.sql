-- Resolve event order line items from carta when event_products snapshot is missing.
CREATE OR REPLACE FUNCTION public.create_event_order(
  p_slug text,
  p_responsible_name text,
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
  v_event_date date;
  v_event_time time;
  v_event_active boolean;
  v_enabled_ids text[];
  v_event_ts timestamptz;

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
  v_order_id uuid;

  y int;
  mo int;
  d int;
  hh int;
  mi int;
BEGIN
  v_responsible := trim(coalesce(p_responsible_name, ''));
  IF v_responsible = '' THEN
    RAISE EXCEPTION 'responsable_requerido';
  END IF;

  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    RAISE EXCEPTION 'slug_requerido';
  END IF;

  SELECT e.id, e.event_date, e.event_time, e.is_active, e.enabled_product_ids
  INTO v_event_id, v_event_date, v_event_time, v_event_active, v_enabled_ids
  FROM public.events e
  WHERE e.slug = trim(p_slug)
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
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

    v_name := NULL;
    v_price := NULL;
    v_category := NULL;

    SELECT ep.name, ep.price, ep.category
    INTO v_name, v_price, v_category
    FROM public.event_products ep
    WHERE ep.product_id = v_pid
      AND ep.is_active = true
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
      FROM public.v_public_menu_items v
      WHERE v.articulo_id::text = v_pid
      LIMIT 1;
    END IF;

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

  INSERT INTO public.event_orders(event_id, responsible_name, items, total_amount, notes)
  VALUES (v_event_id, v_responsible, v_items_out, v_total, NULLIF(trim(coalesce(p_notes,'')), ''))
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_order_id,
    'event_id', v_event_id,
    'responsible_name', v_responsible,
    'items', v_items_out,
    'total_amount', v_total,
    'status', 'pending'
  );
END;
$$;
