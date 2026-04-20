-- Consumo personal: el coste debe ser cantidad en purchase_unit × current_price (€/purchase_unit).
-- Antes: quantity era en unidad de línea de receta (ri.unit) pero stock_movements.unit = ing.unit → desfase (ej. g vs kg).
-- 1) Nuevos movimientos: convertir a purchase_unit en process_staff_consumption.
-- 2) Informes: get_staff_consumption_* usa convert_pricing_qty para movimientos históricos.

CREATE OR REPLACE FUNCTION public.staff_consumption_qty_to_purchase_unit(
  p_qty numeric,
  p_recipe_unit text,
  p_purchase_unit text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v numeric;
BEGIN
  v := public.convert_pricing_qty(
    p_qty,
    p_recipe_unit,
    COALESCE(p_purchase_unit, 'ud')
  );
  IF v IS NULL THEN
    RAISE EXCEPTION 'Consumo personal: unidades incompatibles (receta % → compra %)',
      p_recipe_unit, COALESCE(p_purchase_unit, 'ud')
      USING HINT = 'Revise recipe_ingredients.unit y ingredients.purchase_unit';
  END IF;
  RETURN v;
END;
$$;

COMMENT ON FUNCTION public.staff_consumption_qty_to_purchase_unit(numeric, text, text) IS
  'Convierte cantidad de receta a unidad de compra; falla si no hay conversión (misma lógica que escandallo).';

GRANT EXECUTE ON FUNCTION public.staff_consumption_qty_to_purchase_unit(numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_consumption_qty_to_purchase_unit(numeric, text, text) TO service_role;


CREATE OR REPLACE FUNCTION public.process_staff_consumption(
  p_employee_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ref text := 'STAFF-' || p_employee_id::text || '-' || EXTRACT(EPOCH FROM now())::text;
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO stock_movements (
    movement_type,
    ingredient_id,
    quantity,
    unit,
    movement_date,
    reference_doc,
    original_description,
    processed_by
  )
  SELECT
    'WASTE'::text,
    ri.ingredient_id,
    public.staff_consumption_qty_to_purchase_unit(
      (CASE
        WHEN cart.is_half AND COALESCE(ri.quantity_half, 0) > 0 THEN ri.quantity_half
        ELSE ri.quantity_gross * (CASE WHEN cart.is_half THEN 0.5 ELSE 1.0 END)
      END) * cart.quantity * ri.umb_multiplier,
      ri.unit,
      COALESCE(ing.purchase_unit, 'ud')
    ),
    COALESCE(ing.purchase_unit, 'ud'),
    now(),
    v_ref,
    'Consumo Personal: ' || r.name,
    'Auto-Registro Salida (Staff ID: ' || p_employee_id::text || ')'
  FROM jsonb_to_recordset(p_items) AS cart(recipe_id uuid, quantity numeric, is_half boolean)
  JOIN public.recipe_ingredients ri ON ri.recipe_id = cart.recipe_id
  JOIN public.ingredients ing ON ri.ingredient_id = ing.id
  JOIN public.recipes r ON r.id = ri.recipe_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_staff_consumption(uuid, jsonb) TO authenticated;


-- Importe línea: € = current_price × cantidad en purchase_unit
CREATE OR REPLACE FUNCTION public.staff_consumption_movement_amount_eur(
  p_movement_qty numeric,
  p_movement_unit text,
  p_purchase_unit text,
  p_current_price numeric
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(p_current_price, 0)::numeric
    * COALESCE(
        public.convert_pricing_qty(
          p_movement_qty,
          COALESCE(p_movement_unit, 'ud'),
          COALESCE(p_purchase_unit, 'ud')
        ),
        CASE
          WHEN public.normalize_pricing_unit(COALESCE(p_movement_unit, 'ud'))
               = public.normalize_pricing_unit(COALESCE(p_purchase_unit, 'ud'))
          THEN COALESCE(p_movement_qty, 0)::numeric
          ELSE 0::numeric
        END
      );
$$;

GRANT EXECUTE ON FUNCTION public.staff_consumption_movement_amount_eur(numeric, text, text, numeric) TO authenticated;


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
      public.staff_consumption_movement_amount_eur(
        sm.quantity,
        sm.unit,
        ing.purchase_unit,
        ing.current_price
      ) AS amount
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

GRANT EXECUTE ON FUNCTION public.get_staff_consumption_summary(date, date, uuid) TO authenticated;


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
      regexp_replace(sm.original_description, '^Consumo Personal:\\s*', '') AS product_name,
      public.staff_consumption_movement_amount_eur(
        sm.quantity,
        sm.unit,
        ing.purchase_unit,
        ing.current_price
      )::numeric AS amount
    FROM public.stock_movements sm
    JOIN public.ingredients ing ON ing.id = sm.ingredient_id
    WHERE sm.movement_type = 'WASTE'
      AND sm.reference_doc LIKE 'STAFF-%'
      AND sm.original_description LIKE 'Consumo Personal:%'
      AND (sm.movement_date AT TIME ZONE 'Europe/Madrid')::date = p_date
      AND (
        p_user_id IS NULL
        OR (substring(sm.reference_doc FROM '^STAFF-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-'))::uuid = p_user_id
      )
  ),
  items AS (
    SELECT
      employee_id,
      product_name,
      SUM(amount)::numeric AS amount
    FROM base
    WHERE employee_id IS NOT NULL
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
          'amount', i.amount
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
