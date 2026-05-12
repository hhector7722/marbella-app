-- Consumo personal al fichar salida: evitar fallo "receta u → compra kg" cuando sea posible
-- deducir cantidad en purchase_unit vía datos de pack (tamaño por unidad consumible).
-- Si sigue sin haber conversión, el error incluye producto + ingrediente para corregir datos.
--
-- Firma ampliada (8 args con defaults): sustituye la antigua (numeric,text,text) para no dejar
-- dos overloads ambiguos en pg_proc.

DROP FUNCTION IF EXISTS public.staff_consumption_qty_to_purchase_unit(numeric, text, text);
DROP FUNCTION IF EXISTS public.staff_consumption_qty_to_purchase_unit(double precision, character varying, character varying);

CREATE OR REPLACE FUNCTION public.staff_consumption_qty_to_purchase_unit(
  p_qty numeric,
  p_recipe_unit text,
  p_purchase_unit text,
  p_supplier_pricing_mode text DEFAULT NULL,
  p_pack_unit_size_qty numeric DEFAULT NULL,
  p_pack_unit_size_unit text DEFAULT NULL,
  p_recipe_name text DEFAULT NULL,
  p_ingredient_name text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v numeric;
  piece numeric;
  fu text;
  pu text;
BEGIN
  IF p_qty IS NULL THEN
    RETURN NULL;
  END IF;

  v := public.convert_pricing_qty(
    p_qty,
    p_recipe_unit,
    COALESCE(p_purchase_unit, 'ud')
  );
  IF v IS NOT NULL THEN
    RETURN v;
  END IF;

  fu := public.normalize_pricing_unit(p_recipe_unit);
  pu := public.normalize_pricing_unit(COALESCE(p_purchase_unit, 'ud'));

  -- Puente: receta en unidades (ud) y compra en masa o volumen, con precio por pack
  -- que define tamaño por unidad (ej. 1 ud = 330 ml, compra en L).
  IF fu = 'ud'
     AND pu IN ('g', 'kg', 'ml', 'l')
     AND COALESCE(lower(trim(p_supplier_pricing_mode)), '') = 'per_pack'
     AND p_pack_unit_size_qty IS NOT NULL
     AND p_pack_unit_size_qty > 0
     AND p_pack_unit_size_unit IS NOT NULL
     AND trim(p_pack_unit_size_unit) <> '' THEN
    piece := public.convert_pricing_qty(
      p_pack_unit_size_qty,
      p_pack_unit_size_unit,
      COALESCE(p_purchase_unit, 'ud')
    );
    IF piece IS NOT NULL AND piece > 0 THEN
      RETURN p_qty * piece;
    END IF;
  END IF;

  RAISE EXCEPTION
    'Consumo personal: en "%" el ingrediente "%" no se puede convertir de unidad de receta % a unidad de compra %. Si compra por peso o volumen, use g/kg o ml/L en la línea de receta, o configure "precio por pack" con el tamaño por unidad (ej. 330 ml por botella).',
    COALESCE(NULLIF(trim(p_recipe_name), ''), '(producto)'),
    COALESCE(NULLIF(trim(p_ingredient_name), ''), '(ingrediente)'),
    COALESCE(NULLIF(trim(p_recipe_unit), ''), '?'),
    COALESCE(NULLIF(trim(COALESCE(p_purchase_unit, 'ud')), ''), '?')
    USING HINT = 'Revise recipe_ingredients.unit y ingredients.purchase_unit / supplier_pricing_mode / pack_*';
END;
$$;

COMMENT ON FUNCTION public.staff_consumption_qty_to_purchase_unit(numeric, text, text, text, numeric, text, text, text) IS
  'Convierte cantidad de receta a unidad de compra para consumo personal; prueba convert_pricing_qty y puente per_pack (tamaño por ud).';

GRANT EXECUTE ON FUNCTION public.staff_consumption_qty_to_purchase_unit(numeric, text, text, text, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_consumption_qty_to_purchase_unit(numeric, text, text, text, numeric, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.staff_consumption_qty_to_purchase_unit(
  p_qty double precision,
  p_recipe_unit character varying,
  p_purchase_unit character varying
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.staff_consumption_qty_to_purchase_unit(
    p_qty::numeric,
    p_recipe_unit::text,
    p_purchase_unit::text,
    NULL::text,
    NULL::numeric,
    NULL::text,
    NULL::text,
    NULL::text
  );
$$;

GRANT EXECUTE ON FUNCTION public.staff_consumption_qty_to_purchase_unit(double precision, character varying, character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_consumption_qty_to_purchase_unit(double precision, character varying, character varying) TO service_role;


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
      COALESCE(ing.purchase_unit, 'ud'),
      ing.supplier_pricing_mode,
      ing.pack_unit_size_qty,
      ing.pack_unit_size_unit,
      r.name,
      ing.name
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
