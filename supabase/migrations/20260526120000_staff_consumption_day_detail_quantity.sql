-- Consumo personal: desglose del día incluye cantidad de raciones (quantity) por producto.

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
      (substring(sm.reference_doc FROM '^STAFF-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-'))::uuid AS employee_id,
      sm.reference_doc,
      regexp_replace(sm.original_description, '^Consumo Personal:\s*', '') AS product_name,
      r.id AS recipe_id,
      sm.quantity,
      public.staff_consumption_movement_amount_eur(
        sm.quantity,
        sm.unit,
        ing.purchase_unit,
        ing.current_price
      )::numeric AS amount
    FROM public.stock_movements sm
    JOIN public.ingredients ing ON ing.id = sm.ingredient_id
    JOIN public.recipes r ON sm.original_description = 'Consumo Personal: ' || r.name
    WHERE sm.movement_type = 'WASTE'
      AND sm.reference_doc LIKE 'STAFF-%'
      AND sm.original_description LIKE 'Consumo Personal:%'
      AND (sm.movement_date AT TIME ZONE 'Europe/Madrid')::date = p_date
      AND (
        p_user_id IS NULL
        OR (substring(sm.reference_doc FROM '^STAFF-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-'))::uuid = p_user_id
      )
  ),
  recipe_line_counts AS (
    SELECT
      recipe_id,
      COUNT(DISTINCT ingredient_id)::integer AS ingredient_count
    FROM public.recipe_ingredients
    GROUP BY recipe_id
  ),
  per_ref AS (
    SELECT
      b.employee_id,
      b.product_name,
      b.reference_doc,
      SUM(b.amount)::numeric AS amount,
      GREATEST(
        CASE WHEN SUM(b.amount) > 0 THEN 1 ELSE 0 END,
        ROUND(
          COALESCE(SUM(b.quantity), 0) / NULLIF(MAX(rlc.ingredient_count), 0)
        )::integer
      ) AS quantity
    FROM base b
    JOIN recipe_line_counts rlc ON rlc.recipe_id = b.recipe_id
    WHERE b.employee_id IS NOT NULL
    GROUP BY b.employee_id, b.product_name, b.reference_doc
  ),
  items AS (
    SELECT
      employee_id,
      product_name,
      SUM(amount)::numeric AS amount,
      SUM(quantity)::integer AS quantity
    FROM per_ref
    GROUP BY employee_id, product_name
  ),
  workers AS (
    SELECT
      i.employee_id,
      MAX(NULLIF(trim(concat_ws(' ', pr.first_name, pr.last_name)), '')) AS name,
      SUM(i.amount)::numeric AS total,
      jsonb_agg(
        jsonb_build_object(
          'name', i.product_name,
          'amount', i.amount,
          'quantity', i.quantity
        )
      ) AS items
    FROM items i
    LEFT JOIN public.profiles pr ON pr.id = i.employee_id
    GROUP BY i.employee_id
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
      ) FROM workers),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_consumption_day_detail(date, uuid) TO authenticated;
