-- Sangría de cava: pesos medios de fruta y conversión contenido/envase Juver.
-- Los albaranes confirman 200 ml por botella Juver de naranja y piña.
-- No altera unidades base ('ud'), unidades de compra, precios, artículos TPV ni tickets históricos.
-- Los pesos de fruta son estimaciones para costeo: 5 arándanos ~10 g; 5 frambuesas ~20 g; 5 fresas ~75 g.

BEGIN;
SET LOCAL lock_timeout = '8s';

CREATE TABLE IF NOT EXISTS private.recipe_unit_bridge_audit (
  change_key text PRIMARY KEY,
  recipe_id uuid NOT NULL,
  previous_lines jsonb NOT NULL,
  previous_juice_ingredients jsonb NOT NULL,
  estimated_fruit_weights_g jsonb NOT NULL,
  content_per_juice_unit_ml numeric NOT NULL,
  note text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

DO $guard$
DECLARE
  v_recipe uuid;
  v_fruits int;
  v_juice int;
BEGIN
  SELECT id INTO STRICT v_recipe FROM public.recipes
  WHERE name='Sangria cava' AND is_sellable=true;

  IF EXISTS (SELECT 1 FROM private.recipe_unit_bridge_audit
             WHERE change_key='20261104_sangria_cava_fruits_juver_200ml') THEN
    RAISE EXCEPTION 'Sangria cava ya tiene aplicada la equivalencia del 4/11';
  END IF;

  SELECT count(*) INTO v_fruits
  FROM public.recipe_ingredients ri
  JOIN public.ingredients i ON i.id=ri.ingredient_id
  WHERE ri.recipe_id=v_recipe AND i.name IN ('Arandanos','Frambuesas','Fresas')
    AND ri.unit='ud' AND ri.quantity_gross=5
    AND i.purchase_unit='kg' AND i.base_unit='g';

  IF v_fruits <> 3 THEN RAISE EXCEPTION 'La sangría ya no contiene las tres frutas de 5 unidades'; END IF;

  SELECT count(*) INTO v_juice
  FROM public.recipe_ingredients ri
  JOIN public.ingredients i ON i.id=ri.ingredient_id
  WHERE ri.recipe_id=v_recipe
    AND ((i.name='Juver naranja' AND ri.quantity_gross=150)
      OR (i.name='Juver piña' AND ri.quantity_gross=200))
    AND ri.unit='ml'
    AND i.purchase_unit='ud'
    AND i.recipe_unit='ud'
    AND i.base_unit='ud'
    AND i.pack_unit_size_qty IS NULL
    AND i.pack_unit_size_unit IS NULL;

  IF v_juice <> 2 THEN RAISE EXCEPTION 'Los dos Juver no están en el estado previsto; revisar contenido'; END IF;
END;
$guard$;

INSERT INTO private.recipe_unit_bridge_audit (
  change_key,recipe_id,previous_lines,previous_juice_ingredients,
  estimated_fruit_weights_g,content_per_juice_unit_ml,note
)
SELECT
  '20261104_sangria_cava_fruits_juver_200ml',
  r.id,
  (SELECT jsonb_agg(to_jsonb(ri) ORDER BY ri.id)
   FROM public.recipe_ingredients ri WHERE ri.recipe_id=r.id),
  (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.name)
   FROM public.ingredients i WHERE i.name IN ('Juver naranja','Juver piña')),
  '{"Arandanos":10,"Frambuesas":20,"Fresas":75}'::jsonb,
  200,
  'Pesos de fruta estimados. Juver 200 ml confirmado en albaranes. Sin modificación ni reproceso de tickets o movimientos históricos.'
FROM public.recipes r WHERE r.name='Sangria cava' AND r.is_sellable=true;

-- Convierte ambos sentidos sin cambiar las unidades base de inventario.
-- Antes existía solo ud -> ml/g. Se añade ml/g -> ud mediante el contenido del envase.
CREATE OR REPLACE FUNCTION public.recipe_qty_to_base_unit_with_density(
  p_qty numeric,
  p_recipe_unit text,
  p_base_unit text,
  p_mode text DEFAULT NULL::text,
  p_pack_qty numeric DEFAULT NULL::numeric,
  p_pack_unit text DEFAULT NULL::text,
  p_density_g_per_ml numeric DEFAULT NULL::numeric
)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v numeric;
  piece numeric;
BEGIN
  IF p_qty IS NULL THEN RETURN NULL; END IF;
  v := public.convert_pricing_qty_with_density(p_qty,p_recipe_unit,p_base_unit,p_density_g_per_ml);
  IF v IS NOT NULL THEN RETURN v; END IF;

  -- Compra o inventario en ml/g, receta por envase: 1 ud de 200 ml -> 200 ml.
  IF public.normalize_pricing_unit(p_recipe_unit)='ud'
    AND p_base_unit IN ('ml','g') AND p_pack_qty IS NOT NULL AND p_pack_qty>0
    AND p_pack_unit IS NOT NULL AND trim(p_pack_unit)<>'' THEN
    piece := public.convert_pricing_qty_with_density(
      p_pack_qty,p_pack_unit,p_base_unit,p_density_g_per_ml);
    IF piece IS NOT NULL AND piece>0 THEN RETURN p_qty*piece; END IF;
  END IF;

  -- Compra e inventario por ud, receta por volumen/peso:
  -- p.ej. 150 ml / 200 ml por envase = 0,75 ud de stock.
  IF p_base_unit='ud'
    AND public.normalize_pricing_unit(p_recipe_unit) IN ('ml','cl','l','g','kg')
    AND p_pack_qty IS NOT NULL AND p_pack_qty>0
    AND p_pack_unit IS NOT NULL AND trim(p_pack_unit)<>'' THEN
    piece := public.convert_pricing_qty_with_density(
      p_pack_qty,p_pack_unit,p_recipe_unit,p_density_g_per_ml);
    IF piece IS NOT NULL AND piece>0 THEN RETURN p_qty/piece; END IF;
  END IF;

  RETURN NULL;
END;
$function$;

UPDATE public.ingredients
SET pack_unit_size_qty=200,pack_unit_size_unit='ml'
WHERE name IN ('Juver naranja','Juver piña')
  AND purchase_unit='ud' AND base_unit='ud'
  AND pack_unit_size_qty IS NULL
  AND pack_unit_size_unit IS NULL;

UPDATE public.recipe_ingredients ri
SET quantity_gross=CASE i.name
      WHEN 'Arandanos' THEN 10
      WHEN 'Frambuesas' THEN 20
      WHEN 'Fresas' THEN 75
    END,
    unit='g'
FROM public.ingredients i,public.recipes r
WHERE ri.ingredient_id=i.id
 AND ri.recipe_id=r.id
 AND r.name='Sangria cava'
 AND i.name IN ('Arandanos','Frambuesas','Fresas');

DO $check$
DECLARE
  v_recipe uuid;
  v_cost jsonb;
  v_stock jsonb;
  v_naranja numeric;
  v_pinya numeric;
  v_fresa numeric;
  v_fram numeric;
  v_arandano numeric;
  v_count int;
BEGIN
  SELECT id INTO STRICT v_recipe FROM public.recipes
  WHERE name='Sangria cava' AND is_sellable=true;
  v_cost := public.get_recipe_cost_v2(v_recipe);
  v_stock := public.get_recipe_stock_requirements_v2(v_recipe);
  IF (v_cost->>'ok')::boolean IS DISTINCT FROM true
    OR (v_stock->>'ok')::boolean IS DISTINCT FROM true
    OR jsonb_array_length(v_stock->'ingredients') <> 7 THEN
    RAISE EXCEPTION 'Escandallo/stock de Sangria cava inválido: coste %, stock %',v_cost,v_stock;
  END IF;

  SELECT
    max(CASE WHEN elem->>'ingredient_name'='Juver naranja' THEN (elem->>'quantity_base')::numeric END),
    max(CASE WHEN elem->>'ingredient_name'='Juver piña' THEN (elem->>'quantity_base')::numeric END),
    max(CASE WHEN elem->>'ingredient_name'='Fresas' THEN (elem->>'quantity_base')::numeric END),
    max(CASE WHEN elem->>'ingredient_name'='Frambuesas' THEN (elem->>'quantity_base')::numeric END),
    max(CASE WHEN elem->>'ingredient_name'='Arandanos' THEN (elem->>'quantity_base')::numeric END)
  INTO v_naranja,v_pinya,v_fresa,v_fram,v_arandano
  FROM jsonb_array_elements(v_stock->'ingredients') elem;

  IF v_naranja<>0.75 OR v_pinya<>1 OR v_fresa<>75
    OR v_fram<>20 OR v_arandano<>10 THEN
    RAISE EXCEPTION 'Consumos mixtos incoherentes: naranja %, piña %, fresas %, frambuesas %, arándanos %',
       v_naranja,v_pinya,v_fresa,v_fram,v_arandano;
  END IF;

  -- Las recetas vendibles de cada zumo siguen descontando 1 ud.
  SELECT count(*) INTO v_count
  FROM public.recipes r
  JOIN public.recipe_ingredients ri ON ri.recipe_id=r.id
  JOIN public.ingredients i ON i.id=ri.ingredient_id
  WHERE ((r.name='Zumo naranja' AND i.name='Juver naranja')
    OR (r.name='Zumo piña' AND i.name='Juver piña'))
    AND ri.quantity_gross=1 AND ri.unit='ud'
    AND (public.get_recipe_stock_requirements_v2(r.id)->>'ok')::boolean=true;
  IF v_count<>2 THEN RAISE EXCEPTION 'Ventas individuales de Juver ya no consumen 1 ud'; END IF;
END;
$check$;

COMMIT;
