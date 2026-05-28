BEGIN;

-- -----------------------------------------------------------------------------
-- Event orders system (public form + admin dashboard)
-- Tables:
--   - event_products
--   - event_default_pack (singleton)
--   - events
--   - event_orders
--
-- Notes:
-- - RLS enabled on all tables.
-- - Public browsing (anon/authenticated) allowed for catalog + events metadata.
-- - Public INSERT for orders is ONLY via SECURITY DEFINER function `create_event_order`.
-- -----------------------------------------------------------------------------

-- Ensure required extensions (Supabase usually has pgcrypto enabled).
-- We avoid CREATE EXTENSION here; `gen_random_uuid()` should exist already.

-- -----------------------------------------------------------------------------
-- event_products: catalog for event ordering (snapshot from carta)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_products_product_id_key ON public.event_products (product_id);

CREATE TRIGGER trigger_event_products_updated_at
BEFORE UPDATE ON public.event_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_products ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_products FROM PUBLIC;
REVOKE ALL ON TABLE public.event_products FROM anon;
REVOKE ALL ON TABLE public.event_products FROM authenticated;

GRANT SELECT ON TABLE public.event_products TO anon;
GRANT SELECT ON TABLE public.event_products TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE public.event_products TO authenticated;

DROP POLICY IF EXISTS event_products_select_public ON public.event_products;
CREATE POLICY event_products_select_public
ON public.event_products
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS event_products_manage_managers ON public.event_products;
CREATE POLICY event_products_manage_managers
ON public.event_products
FOR ALL
TO authenticated
USING (public.is_manager_or_admin())
WITH CHECK (public.is_manager_or_admin());

-- -----------------------------------------------------------------------------
-- event_default_pack: singleton configuration
-- -----------------------------------------------------------------------------
-- Fixed ID makes the table an explicit singleton via CHECK.
-- Keep this UUID stable: server actions upsert this exact row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'event_default_pack'
  ) THEN
    CREATE TABLE public.event_default_pack (
      id uuid PRIMARY KEY,
      items jsonb NOT NULL,
      label text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'event_default_pack'
      AND c.conname = 'event_default_pack_singleton'
  ) THEN
    ALTER TABLE public.event_default_pack
      ADD CONSTRAINT event_default_pack_singleton
      CHECK (id = '7a4f7a5b-98b3-4f61-8bb4-0f6b7f6b7c01'::uuid);
  END IF;
END $$;

ALTER TABLE public.event_default_pack ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_default_pack FROM PUBLIC;
REVOKE ALL ON TABLE public.event_default_pack FROM anon;
REVOKE ALL ON TABLE public.event_default_pack FROM authenticated;

GRANT SELECT ON TABLE public.event_default_pack TO anon;
GRANT SELECT ON TABLE public.event_default_pack TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE public.event_default_pack TO authenticated;

DROP POLICY IF EXISTS event_default_pack_select_public ON public.event_default_pack;
CREATE POLICY event_default_pack_select_public
ON public.event_default_pack
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS event_default_pack_upsert_managers ON public.event_default_pack;
CREATE POLICY event_default_pack_upsert_managers
ON public.event_default_pack
FOR ALL
TO authenticated
USING (public.is_manager_or_admin())
WITH CHECK (public.is_manager_or_admin());

-- -----------------------------------------------------------------------------
-- events: event instances with optional overrides
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  event_date date NOT NULL,
  event_time time NOT NULL,
  description text,
  pack_items jsonb,
  enabled_product_ids text[],
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trigger_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.events FROM PUBLIC;
REVOKE ALL ON TABLE public.events FROM anon;
REVOKE ALL ON TABLE public.events FROM authenticated;

GRANT SELECT ON TABLE public.events TO anon;
GRANT SELECT ON TABLE public.events TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.events TO authenticated;

DROP POLICY IF EXISTS events_select_public ON public.events;
CREATE POLICY events_select_public
ON public.events
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS events_manage_managers ON public.events;
CREATE POLICY events_manage_managers
ON public.events
FOR ALL
TO authenticated
USING (public.is_manager_or_admin())
WITH CHECK (public.is_manager_or_admin());

-- -----------------------------------------------------------------------------
-- event_orders: submitted orders (public insert via function only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  responsible_name text NOT NULL,
  items jsonb NOT NULL,
  total_amount numeric,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_orders_event_id_idx ON public.event_orders (event_id);

ALTER TABLE public.event_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_orders FROM PUBLIC;
REVOKE ALL ON TABLE public.event_orders FROM anon;
REVOKE ALL ON TABLE public.event_orders FROM authenticated;

-- Authenticated staff can read/update orders (admin UI); public cannot.
GRANT SELECT, UPDATE ON TABLE public.event_orders TO authenticated;

-- No direct INSERT from anon/authenticated; only via SECURITY DEFINER function.
-- (Function owner inserts bypassing RLS.)

DROP POLICY IF EXISTS event_orders_select_authenticated ON public.event_orders;
CREATE POLICY event_orders_select_authenticated
ON public.event_orders
FOR SELECT
TO authenticated
USING (true);

-- Allow UPDATE for authenticated (status changes will be additionally constrained by app;
-- the policy is permissive by requirement, but we keep it safe by restricting to managers).
DROP POLICY IF EXISTS event_orders_update_managers ON public.event_orders;
CREATE POLICY event_orders_update_managers
ON public.event_orders
FOR UPDATE
TO authenticated
USING (public.is_manager_or_admin())
WITH CHECK (public.is_manager_or_admin());

-- -----------------------------------------------------------------------------
-- RPC: create_event_order (public entrypoint for anon form)
-- -----------------------------------------------------------------------------
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

  -- Combine local event_date + event_time in Europe/Madrid to prevent UTC drift.
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

    -- If event has an explicit allowlist, enforce it.
    IF v_enabled_ids IS NOT NULL AND NOT (v_pid = ANY(v_enabled_ids)) THEN
      RAISE EXCEPTION 'producto_no_permitido: %', v_pid;
    END IF;

    -- Resolve snapshot name/price from event_products (must be active).
    SELECT ep.name, ep.price
    INTO v_name, v_price
    FROM public.event_products ep
    WHERE ep.product_id = v_pid
      AND ep.is_active = true
    LIMIT 1;

    IF v_name IS NULL OR v_price IS NULL THEN
      RAISE EXCEPTION 'producto_no_disponible: %', v_pid;
    END IF;

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

REVOKE ALL ON FUNCTION public.create_event_order(text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_event_order(text, text, jsonb, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_event_order(text, text, jsonb, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_event_order(text, text, jsonb, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_event_order(text, text, jsonb, text) TO authenticated;

COMMIT;

