-- Corrige quantity en desglose: SUM(cantidad movimientos)/n ingredientes daba valores absurdos (×335 bravas).
-- Cantidad = importe del fichaje / food cost de 1 ración (misma lógica que process_staff_consumption con cart.quantity=1).

CREATE OR REPLACE FUNCTION public.staff_consumption_recipe_serving_cost(p_recipe_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    SUM(
      public.staff_consumption_movement_amount_eur(
        public.staff_consumption_qty_to_purchase_unit(
          ri.quantity_gross * ri.umb_multiplier,
          ri.unit,
          COALESCE(ing.purchase_unit, 'ud'),
          ing.supplier_pricing_mode,
          ing.pack_unit_size_qty,
          ing.pack_unit_size_unit,
          r.name,
          ing.name
        ),
        COALESCE(ing.purchase_unit, 'ud'),
        ing.purchase_unit,
        ing.current_price
      )
    ),
    0
  )::numeric
  FROM public.recipe_ingredients ri
  JOIN public.ingredients ing ON ing.id = ri.ingredient_id
  JOIN public.recipes r ON r.id = ri.recipe_id
  WHERE ri.recipe_id = p_recipe_id;
$$;

COMMENT ON FUNCTION public.staff_consumption_recipe_serving_cost(uuid) IS
  'Food cost de 1 ración entera de receta (consumo personal / escandallo).';

GRANT EXECUTE ON FUNCTION public.staff_consumption_recipe_serving_cost(uuid) TO authenticated;

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
  per_ref AS (
    SELECT
      b.employee_id,
      b.product_name,
      b.reference_doc,
      b.recipe_id,
      SUM(b.amount)::numeric AS amount
    FROM base b
    WHERE b.employee_id IS NOT NULL
    GROUP BY b.employee_id, b.product_name, b.reference_doc, b.recipe_id
  ),
  per_ref_qty AS (
    SELECT
      pr.employee_id,
      pr.product_name,
      pr.reference_doc,
      pr.amount,
      CASE
        WHEN pr.amount <= 0 THEN 0
        WHEN public.staff_consumption_recipe_serving_cost(pr.recipe_id) <= 0 THEN 1
        ELSE GREATEST(
          1,
          ROUND(pr.amount / public.staff_consumption_recipe_serving_cost(pr.recipe_id))::integer
        )
      END AS quantity
    FROM per_ref pr
  ),
  items AS (
    SELECT
      employee_id,
      product_name,
      SUM(amount)::numeric AS amount,
      SUM(quantity)::integer AS quantity
    FROM per_ref_qty
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
