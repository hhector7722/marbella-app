-- Consumo personal resiliente:
-- - Obliga al menos una comida en el payload (NO_FOOD bloquea fichaje).
-- - Escribe stock receta a receta; fallos técnicos se registran sin bloquear al staff.
-- - Errores visibles solo en dashboard manager/admin.

CREATE OR REPLACE FUNCTION public.is_drink_consumption_recipe(p_name text, p_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    lower(coalesce(p_category, '')) LIKE '%bebid%'
    OR lower(coalesce(p_category, '')) LIKE '%refresc%'
    OR lower(coalesce(p_category, '')) LIKE '%cervez%'
    OR lower(coalesce(p_category, '')) LIKE '%vino%'
    OR lower(coalesce(p_category, '')) LIKE '%café%'
    OR lower(coalesce(p_category, '')) LIKE '%cafe%'
    OR lower(trim(coalesce(p_name, ''))) ~ '(agua|caf[eé]|cafe|cortado|coca cola|nestea|red bull|zumo|cerveza|vino|t[oó]nica|tonica|fanta|sprite|kas)';
$$;

COMMENT ON FUNCTION public.is_drink_consumption_recipe(text, text) IS
  'Clasificación bebida/comida alineada con isDrinkConsumptionRecipe (TS).';

GRANT EXECUTE ON FUNCTION public.is_drink_consumption_recipe(text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.process_staff_consumption(uuid, jsonb);

CREATE TABLE IF NOT EXISTS public.staff_consumption_register_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reference_doc text NOT NULL,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
  recipe_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  is_half boolean NOT NULL DEFAULT false,
  is_drink boolean NOT NULL DEFAULT false,
  error_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_consumption_register_errors_employee_day
  ON public.staff_consumption_register_errors (employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_consumption_register_errors_reference
  ON public.staff_consumption_register_errors (reference_doc);

COMMENT ON TABLE public.staff_consumption_register_errors IS
  'Intentos de consumo personal que no pudieron escribir stock (error técnico de receta/ingrediente).';

ALTER TABLE public.staff_consumption_register_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_consumption_register_errors_manager_select
  ON public.staff_consumption_register_errors;
CREATE POLICY staff_consumption_register_errors_manager_select
  ON public.staff_consumption_register_errors
  FOR SELECT
  TO authenticated
  USING (public.is_manager_or_admin());

CREATE OR REPLACE FUNCTION public.process_staff_consumption(
  p_employee_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text := 'STAFF-' || p_employee_id::text || '-' || EXTRACT(EPOCH FROM now())::text;
  v_food_count integer := 0;
  v_stock_written integer := 0;
  v_error_count integer := 0;
  cart_rec RECORD;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_employee_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMPTY_CART',
      'stock_written_count', 0,
      'error_count', 0
    );
  END IF;

  SELECT COUNT(*)::integer
  INTO v_food_count
  FROM jsonb_to_recordset(p_items) AS cart(recipe_id uuid, quantity numeric, is_half boolean)
  JOIN public.recipes r ON r.id = cart.recipe_id
  WHERE NOT public.is_drink_consumption_recipe(r.name, r.category);

  IF v_food_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NO_FOOD',
      'stock_written_count', 0,
      'error_count', 0
    );
  END IF;

  FOR cart_rec IN
    SELECT
      cart.recipe_id,
      LEAST(GREATEST(1, cart.quantity), 20) AS quantity,
      cart.is_half,
      r.name AS recipe_name,
      r.category AS recipe_category
    FROM jsonb_to_recordset(p_items) AS cart(recipe_id uuid, quantity numeric, is_half boolean)
    JOIN public.recipes r ON r.id = cart.recipe_id
  LOOP
    BEGIN
      INSERT INTO public.stock_movements (
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
            WHEN cart_rec.is_half AND COALESCE(ri.quantity_half, 0) > 0 THEN ri.quantity_half
            ELSE ri.quantity_gross * (CASE WHEN cart_rec.is_half THEN 0.5 ELSE 1.0 END)
          END) * cart_rec.quantity * ri.umb_multiplier,
          ri.unit,
          COALESCE(ing.purchase_unit, 'ud'),
          ing.supplier_pricing_mode,
          ing.pack_unit_size_qty,
          ing.pack_unit_size_unit,
          cart_rec.recipe_name,
          ing.name
        ),
        COALESCE(ing.purchase_unit, 'ud'),
        now(),
        v_ref,
        'Consumo Personal: ' || cart_rec.recipe_name,
        'Auto-Registro Salida (Staff ID: ' || p_employee_id::text || ')'
      FROM public.recipe_ingredients ri
      JOIN public.ingredients ing ON ri.ingredient_id = ing.id
      WHERE ri.recipe_id = cart_rec.recipe_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Receta "%" sin ingredientes en escandallo', cart_rec.recipe_name;
      END IF;

      v_stock_written := v_stock_written + 1;
    EXCEPTION
      WHEN OTHERS THEN
        INSERT INTO public.staff_consumption_register_errors (
          employee_id,
          reference_doc,
          recipe_id,
          recipe_name,
          quantity,
          is_half,
          is_drink,
          error_message
        ) VALUES (
          p_employee_id,
          v_ref,
          cart_rec.recipe_id,
          cart_rec.recipe_name,
          cart_rec.quantity,
          cart_rec.is_half,
          public.is_drink_consumption_recipe(cart_rec.recipe_name, cart_rec.recipe_category),
          SQLERRM
        );
        v_error_count := v_error_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'reference_doc', v_ref,
    'stock_written_count', v_stock_written,
    'error_count', v_error_count
  );
END;
$$;

COMMENT ON FUNCTION public.process_staff_consumption(uuid, jsonb) IS
  'Registra consumo personal receta a receta. Exige comida en el carrito; errores técnicos se guardan en staff_consumption_register_errors.';

GRANT EXECUTE ON FUNCTION public.process_staff_consumption(uuid, jsonb) TO authenticated;

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
  register_errors AS (
    SELECT
      e.employee_id,
      e.recipe_name AS product_name,
      e.quantity::integer AS quantity,
      e.is_half,
      e.is_drink,
      e.error_message
    FROM public.staff_consumption_register_errors e
    WHERE (e.created_at AT TIME ZONE 'Europe/Madrid')::date = p_date
      AND (p_user_id IS NULL OR e.employee_id = p_user_id)
  ),
  all_employees AS (
    SELECT employee_id FROM items
    UNION
    SELECT employee_id FROM register_errors
  ),
  worker_items AS (
    SELECT
      i.employee_id,
      SUM(i.amount)::numeric AS total,
      jsonb_agg(
        jsonb_build_object(
          'name', i.product_name,
          'amount', i.amount,
          'quantity', i.quantity
        )
        ORDER BY i.amount DESC, i.product_name ASC
      ) AS items
    FROM items i
    GROUP BY i.employee_id
  ),
  worker_errors AS (
    SELECT
      employee_id,
      jsonb_agg(
        jsonb_build_object(
          'name', product_name,
          'quantity', quantity,
          'is_half', is_half,
          'is_drink', is_drink,
          'error_message', error_message
        )
        ORDER BY product_name
      ) AS errors
    FROM register_errors
    GROUP BY employee_id
  ),
  workers AS (
    SELECT
      ae.employee_id,
      NULLIF(trim(concat_ws(' ', pr.first_name, pr.last_name)), '') AS name,
      COALESCE(wi.total, 0)::numeric AS total,
      COALESCE(wi.items, '[]'::jsonb) AS items,
      COALESCE(we.errors, '[]'::jsonb) AS errors
    FROM all_employees ae
    LEFT JOIN public.profiles pr ON pr.id = ae.employee_id
    LEFT JOIN worker_items wi ON wi.employee_id = ae.employee_id
    LEFT JOIN worker_errors we ON we.employee_id = ae.employee_id
  )
  SELECT jsonb_build_object(
    'date', to_char(p_date, 'YYYY-MM-DD'),
    'totalAmount', COALESCE((SELECT SUM(total) FROM workers), 0),
    'errorCount', COALESCE((SELECT COUNT(*)::integer FROM register_errors), 0),
    'workers', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', employee_id,
          'name', name,
          'total', total,
          'items', COALESCE(items, '[]'::jsonb),
          'errors', COALESCE(errors, '[]'::jsonb)
        )
        ORDER BY COALESCE(total, 0) DESC, name ASC
      ) FROM workers WHERE employee_id IS NOT NULL),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_consumption_day_detail(date, uuid) TO authenticated;
