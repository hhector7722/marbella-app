BEGIN;

-- -----------------------------------------------------------------------------
-- Encargos vinculados a reservas + pedidos internos por personal
-- -----------------------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.events.reservation_id IS
  'Reserva opcional vinculada; NULL = encargo huérfano (visible en calendario).';

CREATE INDEX IF NOT EXISTS events_reservation_id_idx ON public.events (reservation_id);
CREATE INDEX IF NOT EXISTS events_event_date_idx ON public.events (event_date);

-- Helper: staff+ pueden gestionar encargos (misma puerta que reservas)
CREATE OR REPLACE FUNCTION public.can_manage_encargos()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN (
      'staff', 'supervisor', 'manager', 'admin'
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_encargos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_encargos() TO authenticated;

-- RLS events: staff+ puede INSERT/UPDATE (DELETE sigue manager/admin)
DROP POLICY IF EXISTS events_manage_managers ON public.events;

CREATE POLICY events_insert_staff
ON public.events
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_encargos());

CREATE POLICY events_update_staff
ON public.events
FOR UPDATE
TO authenticated
USING (public.can_manage_encargos())
WITH CHECK (public.can_manage_encargos());

CREATE POLICY events_delete_managers
ON public.events
FOR DELETE
TO authenticated
USING (public.is_manager_or_admin());

-- Staff puede insertar pedidos vía RPC; política directa por si acaso en futuro
DROP POLICY IF EXISTS event_orders_insert_staff ON public.event_orders;
CREATE POLICY event_orders_insert_staff
ON public.event_orders
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_encargos());

-- -----------------------------------------------------------------------------
-- RPC: create_staff_event_order — pedido cerrado por personal (status confirmed)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_staff_event_order(
  p_event_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_responsible_name text DEFAULT NULL
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
  v_event_name text;
  v_enabled_ids text[];
  v_reservation_id uuid;

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no_autenticado';
  END IF;

  IF NOT public.can_manage_encargos() THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  SELECT e.id, e.event_date, e.event_time, e.name, e.enabled_product_ids, e.reservation_id
  INTO v_event_id, v_event_date, v_event_time, v_event_name, v_enabled_ids, v_reservation_id
  FROM public.events e
  WHERE e.id = p_event_id
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_responsible := NULLIF(trim(coalesce(p_responsible_name, '')), '');
  IF v_responsible IS NULL THEN
    v_responsible := NULLIF(trim(coalesce(v_event_name, '')), '');
  END IF;
  IF v_responsible IS NULL THEN
    v_responsible := 'Personal';
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

    IF v_enabled_ids IS NOT NULL AND array_length(v_enabled_ids, 1) > 0 AND NOT (v_pid = ANY(v_enabled_ids)) THEN
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

  INSERT INTO public.event_orders(event_id, responsible_name, items, total_amount, notes, status)
  VALUES (
    v_event_id,
    v_responsible,
    v_items_out,
    v_total,
    NULLIF(trim(coalesce(p_notes, '')), ''),
    'confirmed'
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_order_id,
    'event_id', v_event_id,
    'responsible_name', v_responsible,
    'items', v_items_out,
    'total_amount', v_total,
    'status', 'confirmed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff_event_order(uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_staff_event_order(uuid, jsonb, text, text) TO authenticated;

COMMIT;
