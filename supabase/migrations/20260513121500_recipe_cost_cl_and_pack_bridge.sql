-- Centilitros en convert_pricing_qty + coste de receta con puente per_pack (ud↔masa/volumen),
-- alineado con src/lib/recipe-cost.ts y staff_consumption_qty_to_purchase_unit.

CREATE OR REPLACE FUNCTION public.convert_pricing_qty(
  p_qty numeric,
  p_from_unit text,
  p_to_unit text
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  fu text := public.normalize_pricing_unit(p_from_unit);
  tu text := public.normalize_pricing_unit(p_to_unit);
  qty_ml numeric;
BEGIN
  IF p_qty IS NULL THEN
    RETURN NULL;
  END IF;

  IF fu = tu THEN
    RETURN p_qty;
  END IF;

  -- masa
  IF fu IN ('g','kg') AND tu IN ('g','kg') THEN
    IF fu = 'g' AND tu = 'kg' THEN
      RETURN p_qty / 1000.0;
    ELSIF fu = 'kg' AND tu = 'g' THEN
      RETURN p_qty * 1000.0;
    END IF;
  END IF;

  -- volumen (ml, l, cl vía ml)
  IF fu IN ('ml','l','cl') AND tu IN ('ml','l','cl') THEN
    qty_ml := CASE
      WHEN fu = 'ml' THEN p_qty
      WHEN fu = 'l' THEN p_qty * 1000.0
      WHEN fu = 'cl' THEN p_qty * 10.0
    END;
    IF tu = 'ml' THEN
      RETURN qty_ml;
    ELSIF tu = 'l' THEN
      RETURN qty_ml / 1000.0;
    ELSIF tu = 'cl' THEN
      RETURN qty_ml / 10.0;
    END IF;
  END IF;

  IF fu = 'ud' AND tu = 'ud' THEN
    RETURN p_qty;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.convert_pricing_qty(numeric, text, text) IS
  'Convierte cantidad entre unidades compatibles: g↔kg, ml↔l↔cl, ud↔ud.';

CREATE OR REPLACE FUNCTION public.recipe_qty_to_purchase_unit_for_cost(
  p_qty numeric,
  p_recipe_unit text,
  p_purchase_unit text,
  p_mode text DEFAULT NULL,
  p_pack_qty numeric DEFAULT NULL,
  p_pack_unit text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
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

  v := public.convert_pricing_qty(p_qty, p_recipe_unit, p_purchase_unit);
  IF v IS NOT NULL THEN
    RETURN v;
  END IF;

  fu := public.normalize_pricing_unit(p_recipe_unit);
  pu := public.normalize_pricing_unit(coalesce(p_purchase_unit, 'ud'));

  IF fu = 'ud'
     AND pu IN ('g', 'kg', 'ml', 'l', 'cl')
     AND lower(trim(coalesce(p_mode, ''))) = 'per_pack'
     AND p_pack_qty IS NOT NULL
     AND p_pack_qty > 0
     AND p_pack_unit IS NOT NULL
     AND trim(p_pack_unit) <> '' THEN
    piece := public.convert_pricing_qty(p_pack_qty, p_pack_unit, p_purchase_unit);
    IF piece IS NOT NULL AND piece > 0 THEN
      RETURN p_qty * piece;
    END IF;
  END IF;

  IF pu = 'ud'
     AND fu IN ('g', 'kg', 'ml', 'l', 'cl')
     AND lower(trim(coalesce(p_mode, ''))) = 'per_pack'
     AND p_pack_qty IS NOT NULL
     AND p_pack_qty > 0
     AND p_pack_unit IS NOT NULL
     AND trim(p_pack_unit) <> '' THEN
    piece := public.convert_pricing_qty(p_pack_qty, p_pack_unit, p_recipe_unit);
    IF piece IS NOT NULL AND piece > 0 THEN
      RETURN p_qty / piece;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.recipe_qty_to_purchase_unit_for_cost(numeric, text, text, text, numeric, text) IS
  'Cantidad de receta en unidad de compra; incluye puente per_pack (ud↔masa/volumen).';

-- Importante: NO hacer DROP de la firma antigua de fn_recipe_line_cost antes de sustituir get_recipe_cost:
-- get_recipe_cost depende de esa función y el DROP puede bloquear o forzar esperas largas (a veces percibidas como timeout vía proxy).
-- Orden: (1) nueva sobrecarga 9 args, (2) get_recipe_cost apunta a ella, (3) DROP solo la firma de 6 args.

CREATE OR REPLACE FUNCTION public.fn_recipe_line_cost(
  p_quantity_gross numeric,
  p_quantity_half numeric,
  p_recipe_unit text,
  p_purchase_unit text,
  p_current_price numeric,
  p_use_half boolean DEFAULT false,
  p_supplier_pricing_mode text DEFAULT NULL,
  p_pack_unit_size_qty numeric DEFAULT NULL,
  p_pack_unit_size_unit text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  qty numeric := CASE WHEN p_use_half THEN coalesce(p_quantity_half, 0) ELSE coalesce(p_quantity_gross, 0) END;
  converted numeric;
BEGIN
  IF p_current_price IS NULL OR p_current_price < 0 THEN
    RETURN 0;
  END IF;

  IF qty = 0 THEN
    RETURN 0;
  END IF;

  converted := public.recipe_qty_to_purchase_unit_for_cost(
    qty,
    p_recipe_unit,
    p_purchase_unit,
    p_supplier_pricing_mode,
    p_pack_unit_size_qty,
    p_pack_unit_size_unit
  );

  IF converted IS NULL THEN
    RETURN 0;
  END IF;

  RETURN converted * p_current_price;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_recipe_cost(
  p_recipe_id uuid,
  p_use_half_ration boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  total numeric;
  lines_agg jsonb;
BEGIN
  WITH costed AS (
    SELECT
      ri.id AS line_id,
      i.name AS ingredient_name,
      public.fn_recipe_line_cost(
        ri.quantity_gross,
        ri.quantity_half,
        ri.unit,
        i.purchase_unit,
        i.current_price,
        p_use_half_ration,
        i.supplier_pricing_mode,
        i.pack_unit_size_qty,
        i.pack_unit_size_unit
      ) AS line_cost
    FROM public.recipe_ingredients ri
    JOIN public.ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = p_recipe_id
  )
  SELECT coalesce(sum(line_cost), 0), coalesce(jsonb_agg(jsonb_build_object('line_id', line_id, 'ingredient_name', ingredient_name, 'line_cost', round(line_cost::numeric, 2))), '[]'::jsonb)
  INTO total, lines_agg
  FROM costed;

  RETURN jsonb_build_object(
    'total_cost', round(total::numeric, 2),
    'lines', lines_agg
  );
END;
$$;

DROP FUNCTION IF EXISTS public.fn_recipe_line_cost(numeric, numeric, text, text, numeric, boolean);

COMMENT ON FUNCTION public.get_recipe_cost(uuid, boolean) IS
  'Coste total de receta (backend). Incluye cl y puente per_pack como recipe-cost.ts.';

GRANT EXECUTE ON FUNCTION public.recipe_qty_to_purchase_unit_for_cost(numeric, text, text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recipe_qty_to_purchase_unit_for_cost(numeric, text, text, text, numeric, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.fn_recipe_line_cost(numeric, numeric, text, text, numeric, boolean, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recipe_line_cost(numeric, numeric, text, text, numeric, boolean, text, numeric, text) TO service_role;
