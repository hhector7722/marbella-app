BEGIN;

-- -----------------------------------------------------------------------------
-- Edición de pedido por cliente vía URL privada (token)
-- No cambia el modelo: events + event_orders. Solo añade permiso + token.
-- -----------------------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS client_edit_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS client_edit_token uuid;

COMMENT ON COLUMN public.events.client_edit_enabled IS
  'Si true, el cliente puede editar el pedido primario vía /pedido/{client_edit_token}.';

COMMENT ON COLUMN public.events.client_edit_token IS
  'Token opaco para URL privada de edición cliente. NULL si no habilitado.';

CREATE UNIQUE INDEX IF NOT EXISTS events_client_edit_token_uidx
  ON public.events (client_edit_token)
  WHERE client_edit_token IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Helper: resolver precio/nombre desde event_products o carta pública
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolve_event_order_product(p_product_id text)
RETURNS TABLE (name text, price numeric, category text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_price numeric;
  v_category text;
BEGIN
  SELECT ep.name, ep.price, ep.category
  INTO v_name, v_price, v_category
  FROM public.event_products ep
  WHERE ep.product_id = p_product_id
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
    WHERE v.articulo_id::text = p_product_id
    LIMIT 1;
  END IF;

  IF v_name IS NULL OR v_name = '' OR v_price IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT v_name, v_price, v_category;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_resolve_event_order_product(text) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- Staff: habilitar edición cliente + asegurar pedido vacío (si no hay)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enable_event_client_edit(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_order_id uuid;
  v_token uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no_autenticado';
  END IF;
  IF NOT public.can_manage_encargos() THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  SELECT * INTO v_event FROM public.events e WHERE e.id = p_event_id LIMIT 1;
  IF v_event.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_token := coalesce(v_event.client_edit_token, gen_random_uuid());

  UPDATE public.events
  SET
    client_edit_enabled = true,
    client_edit_token = v_token,
    updated_at = now()
  WHERE id = v_event.id;

  SELECT o.id INTO v_order_id
  FROM public.event_orders o
  WHERE o.event_id = v_event.id
    AND o.status IN ('pending', 'confirmed')
  ORDER BY
    CASE WHEN o.status = 'confirmed' THEN 0 ELSE 1 END,
    o.created_at ASC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    INSERT INTO public.event_orders (event_id, responsible_name, items, total_amount, notes, status)
    VALUES (
      v_event.id,
      coalesce(nullif(trim(v_event.name), ''), 'Cliente'),
      '[]'::jsonb,
      0,
      NULL,
      'pending'
    )
    RETURNING id INTO v_order_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', v_event.id,
    'client_edit_token', v_token,
    'order_id', v_order_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enable_event_client_edit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enable_event_client_edit(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Staff: deshabilitar edición cliente (mantiene token por si se reactiva)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disable_event_client_edit(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no_autenticado';
  END IF;
  IF NOT public.can_manage_encargos() THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  UPDATE public.events
  SET client_edit_enabled = false, updated_at = now()
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'event_id', p_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.disable_event_client_edit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disable_event_client_edit(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Público (anon): guardar/actualizar pedido primario por token
-- -----------------------------------------------------------------------------
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

REVOKE ALL ON FUNCTION public.save_client_event_order_by_token(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_client_event_order_by_token(uuid, jsonb, text) TO anon;
GRANT EXECUTE ON FUNCTION public.save_client_event_order_by_token(uuid, jsonb, text) TO authenticated;

COMMIT;
