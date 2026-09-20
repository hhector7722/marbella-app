-- El coste de receta solo lee ingredients.current_price. Los antiguos parámetros
-- de modo se conservan en las firmas para no romper consumidores, pero ya no
-- participan en ninguna conversión: pack_unit_size_* es equivalencia física.

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
  IF p_qty IS NULL THEN RETURN NULL; END IF;

  v := public.convert_pricing_qty(p_qty, p_recipe_unit, p_purchase_unit);
  IF v IS NOT NULL THEN RETURN v; END IF;

  fu := public.normalize_pricing_unit(p_recipe_unit);
  pu := public.normalize_pricing_unit(coalesce(p_purchase_unit, 'ud'));

  IF fu = 'ud'
     AND pu IN ('g', 'kg', 'ml', 'l', 'cl')
     AND p_pack_qty IS NOT NULL AND p_pack_qty > 0
     AND p_pack_unit IS NOT NULL AND trim(p_pack_unit) <> '' THEN
    piece := public.convert_pricing_qty(p_pack_qty, p_pack_unit, p_purchase_unit);
    IF piece IS NOT NULL AND piece > 0 THEN RETURN p_qty * piece; END IF;
  END IF;

  IF pu = 'ud'
     AND fu IN ('g', 'kg', 'ml', 'l', 'cl')
     AND p_pack_qty IS NOT NULL AND p_pack_qty > 0
     AND p_pack_unit IS NOT NULL AND trim(p_pack_unit) <> '' THEN
    piece := public.convert_pricing_qty(p_pack_qty, p_pack_unit, p_recipe_unit);
    IF piece IS NOT NULL AND piece > 0 THEN RETURN p_qty / piece; END IF;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.recipe_qty_to_purchase_unit_for_cost(numeric, text, text, text, numeric, text) IS
  'Cantidad de receta en unidad de compra; admite equivalencia física ud↔masa/volumen. p_mode se ignora por compatibilidad.';

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
  IF p_qty IS NULL THEN RETURN NULL; END IF;

  v := public.convert_pricing_qty(p_qty, p_recipe_unit, coalesce(p_purchase_unit, 'ud'));
  IF v IS NOT NULL THEN RETURN v; END IF;

  fu := public.normalize_pricing_unit(p_recipe_unit);
  pu := public.normalize_pricing_unit(coalesce(p_purchase_unit, 'ud'));

  IF fu = 'ud'
     AND pu IN ('g', 'kg', 'ml', 'l', 'cl')
     AND p_pack_unit_size_qty IS NOT NULL AND p_pack_unit_size_qty > 0
     AND p_pack_unit_size_unit IS NOT NULL AND trim(p_pack_unit_size_unit) <> '' THEN
    piece := public.convert_pricing_qty(
      p_pack_unit_size_qty,
      p_pack_unit_size_unit,
      coalesce(p_purchase_unit, 'ud')
    );
    IF piece IS NOT NULL AND piece > 0 THEN RETURN p_qty * piece; END IF;
  END IF;

  IF pu = 'ud'
     AND fu IN ('g', 'kg', 'ml', 'l', 'cl')
     AND p_pack_unit_size_qty IS NOT NULL AND p_pack_unit_size_qty > 0
     AND p_pack_unit_size_unit IS NOT NULL AND trim(p_pack_unit_size_unit) <> '' THEN
    piece := public.convert_pricing_qty(
      p_pack_unit_size_qty,
      p_pack_unit_size_unit,
      p_recipe_unit
    );
    IF piece IS NOT NULL AND piece > 0 THEN RETURN p_qty / piece; END IF;
  END IF;

  RAISE EXCEPTION
    'Consumo personal: en "%" el ingrediente "%" no se puede convertir de unidad de receta % a unidad de compra %. Configure unidades compatibles o la equivalencia física por unidad.',
    coalesce(nullif(trim(p_recipe_name), ''), '(producto)'),
    coalesce(nullif(trim(p_ingredient_name), ''), '(ingrediente)'),
    coalesce(nullif(trim(p_recipe_unit), ''), '?'),
    coalesce(nullif(trim(coalesce(p_purchase_unit, 'ud')), ''), '?')
    USING HINT = 'Revise recipe_ingredients.unit, ingredients.purchase_unit y pack_unit_size_*';
END;
$$;

COMMENT ON FUNCTION public.staff_consumption_qty_to_purchase_unit(numeric, text, text, text, numeric, text, text, text) IS
  'Convierte consumo a unidad de compra mediante unidades compatibles o equivalencia física por unidad. El modo de precio se ignora.';

DO $$
BEGIN
  IF public.recipe_qty_to_purchase_unit_for_cost(1, 'ud', 'kg', NULL, 125, 'g') <> 0.125 THEN
    RAISE EXCEPTION 'Contrato físico SQL incumplido: 1 ud de 125 g debe ser 0.125 kg';
  END IF;
  IF public.recipe_qty_to_purchase_unit_for_cost(24, 'ud', 'l', 'per_purchase_unit', 330, 'ml') <> 7.92 THEN
    RAISE EXCEPTION 'Contrato físico SQL incumplido: 24 ud de 330 ml deben ser 7.92 l';
  END IF;
  IF public.fn_recipe_line_cost(1, 0, 'ud', 'kg', 8, false, NULL, 125, 'g') <> 1 THEN
    RAISE EXCEPTION 'Contrato económico SQL incumplido: el coste debe usar current_price';
  END IF;
END;
$$;
