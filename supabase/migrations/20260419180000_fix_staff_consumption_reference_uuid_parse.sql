-- Fix: reference_doc es STAFF-<uuid>-<epoch>. split_part(..., '-', 2) rompe el UUID
-- y el cast a uuid falla → el RPC devolvía error y el dashboard no cargaba.

CREATE OR REPLACE FUNCTION public.get_staff_consumption_summary(
  p_start_date date,
  p_end_date date,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_days integer;
  v_by_date jsonb;
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  WITH base AS (
    SELECT
      (sm.movement_date AT TIME ZONE 'Europe/Madrid')::date AS day,
      (regexp_match(sm.reference_doc, '^STAFF-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-'))[1]::uuid AS employee_id,
      COALESCE(ing.current_price, 0) * COALESCE(sm.quantity, 0) AS amount
    FROM public.stock_movements sm
    JOIN public.ingredients ing ON ing.id = sm.ingredient_id
    WHERE sm.movement_type = 'WASTE'
      AND sm.reference_doc LIKE 'STAFF-%'
      AND sm.original_description LIKE 'Consumo Personal:%'
      AND (sm.movement_date AT TIME ZONE 'Europe/Madrid')::date >= p_start_date
      AND (sm.movement_date AT TIME ZONE 'Europe/Madrid')::date <= p_end_date
      AND (
        p_user_id IS NULL
        OR (regexp_match(sm.reference_doc, '^STAFF-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-'))[1]::uuid = p_user_id
      )
  ),
  agg AS (
    SELECT day, SUM(amount)::numeric AS total
    FROM base
    GROUP BY day
  )
  SELECT
    COALESCE(SUM(total), 0)::numeric,
    COALESCE(COUNT(*), 0)::integer,
    COALESCE(
      jsonb_object_agg(
        to_char(day, 'YYYY-MM-DD'),
        jsonb_build_object('total', total)
      ),
      '{}'::jsonb
    )
  INTO v_total, v_days, v_by_date
  FROM agg;

  RETURN jsonb_build_object(
    'totalAmount', v_total,
    'daysInPeriod', v_days,
    'byDate', v_by_date
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_staff_consumption_day_detail(
  p_date date,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  WITH base AS (
    SELECT
      (regexp_match(sm.reference_doc, '^STAFF-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-'))[1]::uuid AS employee_id,
      regexp_replace(sm.original_description, '^Consumo Personal:\\s*', '') AS product_name,
      (COALESCE(ing.current_price, 0) * COALESCE(sm.quantity, 0))::numeric AS amount
    FROM public.stock_movements sm
    JOIN public.ingredients ing ON ing.id = sm.ingredient_id
    WHERE sm.movement_type = 'WASTE'
      AND sm.reference_doc LIKE 'STAFF-%'
      AND sm.original_description LIKE 'Consumo Personal:%'
      AND (sm.movement_date AT TIME ZONE 'Europe/Madrid')::date = p_date
      AND (
        p_user_id IS NULL
        OR (regexp_match(sm.reference_doc, '^STAFF-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-'))[1]::uuid = p_user_id
      )
  ),
  items AS (
    SELECT
      employee_id,
      product_name,
      SUM(amount)::numeric AS amount
    FROM base
    GROUP BY employee_id, product_name
  ),
  workers AS (
    SELECT
      i.employee_id,
      p.full_name AS name,
      SUM(i.amount)::numeric AS total,
      jsonb_agg(
        jsonb_build_object(
          'name', i.product_name,
          'amount', i.amount
        )
        ORDER BY i.amount DESC, i.product_name ASC
      ) AS items
    FROM items i
    LEFT JOIN public.profiles p ON p.id = i.employee_id
    GROUP BY i.employee_id, p.full_name
  )
  SELECT jsonb_build_object(
    'date', to_char(p_date, 'YYYY-MM-DD'),
    'totalAmount', COALESCE((SELECT SUM(total) FROM workers), 0),
    'workers', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', employee_id,
          'name', name,
          'total', total,
          'items', items
        )
        ORDER BY total DESC
      ) FROM workers),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;
