-- RPC: coste de receta calculado en backend (fuente de verdad).
-- Misma lógica que src/lib/recipe-cost.ts: conversión de unidades (g/kg, ml/L, ud) y precio por purchase_unit.

-- Función interna: convierte cantidad de unidad receta a unidad compra y devuelve coste línea (o 0 si incompatibles).
CREATE OR REPLACE FUNCTION public.fn_recipe_line_cost(
  p_quantity_gross NUMERIC,
  p_quantity_half NUMERIC,
  p_recipe_unit TEXT,
  p_purchase_unit TEXT,
  p_current_price NUMERIC,
  p_use_half BOOLEAN DEFAULT FALSE
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  qty NUMERIC := CASE WHEN p_use_half THEN COALESCE(p_quantity_half, 0) ELSE COALESCE(p_quantity_gross, 0) END;
  ru TEXT := lower(trim(coalesce(p_recipe_unit, 'kg')));
  pu TEXT := lower(trim(coalesce(p_purchase_unit, 'kg')));
  converted NUMERIC;
BEGIN
  IF p_current_price IS NULL OR p_current_price < 0 THEN
    RETURN 0;
  END IF;

  -- Misma dimensión: masa (g, kg)
  IF ru IN ('g','kg') AND pu IN ('g','kg') THEN
    IF ru = 'g' AND pu = 'kg' THEN converted := qty / 1000.0;
    ELSIF ru = 'kg' AND pu = 'g' THEN converted := qty * 1000.0;
    ELSE converted := qty;
    END IF;
    RETURN converted * p_current_price;
  END IF;

  -- Misma dimensión: volumen (ml, l)
  IF ru IN ('ml','l') AND pu IN ('ml','l') THEN
    IF ru = 'ml' AND pu = 'l' THEN converted := qty / 1000.0;
    ELSIF ru = 'l' AND pu = 'ml' THEN converted := qty * 1000.0;
    ELSE converted := qty;
    END IF;
    RETURN converted * p_current_price;
  END IF;

  -- Unidades (ud)
  IF ru = 'ud' AND pu = 'ud' THEN
    RETURN qty * p_current_price;
  END IF;

  -- Incompatibles
  RETURN 0;
END;
$$;

-- RPC pública: devuelve coste total y desglose por línea para una receta.
CREATE OR REPLACE FUNCTION public.get_recipe_cost(
  p_recipe_id UUID,
  p_use_half_ration BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  total NUMERIC;
  lines_agg JSONB;
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
        p_use_half_ration
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

COMMENT ON FUNCTION public.get_recipe_cost(UUID, BOOLEAN) IS 'Coste total de receta (backend). Usar para informes y como fuente de verdad; frontend puede seguir calculando en vivo para UX.';

GRANT EXECUTE ON FUNCTION public.fn_recipe_line_cost(NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recipe_line_cost(NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_recipe_cost(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recipe_cost(UUID, BOOLEAN) TO service_role;
