-- Verduras horno: estimación REVERSIBLE y auditada del rendimiento real cocinado.
-- 2.710 g de verduras crudas -> 2.250 g cocidos estimados (15 raciones x 150 g).
-- Sólo aplica desde este cambio; no reescribe tickets, ventas ni movimientos históricos.
-- Cuando se pese la tanda, cambiar yield_quantity manteniendo 150 g por ración.

BEGIN;
SET LOCAL lock_timeout = '8s';

CREATE TABLE IF NOT EXISTS private.recipe_composition_change_audit (
    change_key text PRIMARY KEY,
    recipe_id uuid NOT NULL,
    production_recipe_id uuid NOT NULL,
    previous_ingredients jsonb NOT NULL,
    previous_cost_eur numeric,
    estimated_yield_g numeric NOT NULL,
    serving_g numeric NOT NULL,
    captured_at timestamptz NOT NULL DEFAULT now(),
    note text NOT NULL
);

DO $guard$
DECLARE
    v_sell uuid;
    v_prod uuid;
    v_sale_count integer;
    v_production_count integer;
    v_diff_count integer;
BEGIN
    SELECT id INTO STRICT v_sell FROM public.recipes
    WHERE name = 'Verduras horno' AND is_sellable = true;
    SELECT id INTO STRICT v_prod FROM public.recipes
    WHERE name = 'Verduras horno prod' AND is_sellable = false;

    PERFORM 1 FROM public.recipes WHERE id IN (v_sell, v_prod) FOR UPDATE;

    IF (SELECT count(*) FROM public.map_tpv_receta
        WHERE articulo_id = 197 AND recipe_id = v_sell AND factor_porcion = 1) <> 1 THEN
        RAISE EXCEPTION 'Artículo TPV 197 ya no apunta a Verduras horno (factor 1)';
    END IF;

    SELECT count(*) INTO v_sale_count FROM public.recipe_ingredients WHERE recipe_id = v_sell;
    SELECT count(*) INTO v_production_count FROM public.recipe_ingredients WHERE recipe_id = v_prod;
    IF v_sale_count <> 8 OR v_production_count <> 8 THEN
        RAISE EXCEPTION 'Escandallos inesperados, vendible % líneas / elaboración % líneas',
            v_sale_count, v_production_count;
    END IF;

    SELECT count(*) INTO v_diff_count FROM (
        (SELECT ingredient_id, quantity_gross, quantity_net, unit, quantity_half, umb_multiplier
         FROM public.recipe_ingredients WHERE recipe_id = v_sell
         EXCEPT ALL
         SELECT ingredient_id, quantity_gross, quantity_net, unit, quantity_half, umb_multiplier
         FROM public.recipe_ingredients WHERE recipe_id = v_prod)
        UNION ALL
        (SELECT ingredient_id, quantity_gross, quantity_net, unit, quantity_half, umb_multiplier
         FROM public.recipe_ingredients WHERE recipe_id = v_prod
         EXCEPT ALL
         SELECT ingredient_id, quantity_gross, quantity_net, unit, quantity_half, umb_multiplier
         FROM public.recipe_ingredients WHERE recipe_id = v_sell)
    ) differences;
    IF v_diff_count <> 0 THEN
        RAISE EXCEPTION 'El lote y la receta vendible ya no tienen los mismos ingredientes';
    END IF;

    IF EXISTS (SELECT 1 FROM public.recipe_subrecipes WHERE parent_recipe_id = v_sell) THEN
        RAISE EXCEPTION 'Verduras horno ya tiene elaboraciones asociadas';
    END IF;

    IF EXISTS (SELECT 1 FROM private.recipe_composition_change_audit
      WHERE change_key = '20261104_verduras_horno_estimated_2250g') THEN
      RAISE EXCEPTION 'Ya existe una auditoría de cambio para Verduras horno';
    END IF;

    IF EXISTS (SELECT 1 FROM public.recipes
               WHERE id = v_prod AND (yield_quantity IS NOT NULL OR yield_unit IS NOT NULL)) THEN
      RAISE EXCEPTION 'El rendimiento de Verduras horno prod ya ha sido actualizado';
    END IF;
END;
$guard$;

INSERT INTO private.recipe_composition_change_audit (
    change_key, recipe_id, production_recipe_id, previous_ingredients,
    previous_cost_eur, estimated_yield_g, serving_g, note
)
SELECT
    '20261104_verduras_horno_estimated_2250g', sell.id, prod.id,
    (SELECT jsonb_agg(to_jsonb(ri) ORDER BY ri.id)
        FROM public.recipe_ingredients ri WHERE ri.recipe_id = sell.id),
    (public.get_recipe_cost_v2(sell.id)->>'total_cost_eur')::numeric,
    2250, 150,
    'Corte de composición, NO regularización histórica. Rendimiento 2250 g aproximado, sujeto a pesado.'
FROM public.recipes sell CROSS JOIN public.recipes prod
WHERE sell.name='Verduras horno' AND sell.is_sellable=true
  AND prod.name='Verduras horno prod' AND prod.is_sellable=false;

UPDATE public.recipes
SET yield_quantity = 2250, yield_unit = 'g', servings = 15,
    updated_at = now(),
    elaboration = concat_ws(E'\n\n', NULLIF(elaboration, ''),
       'RENDIMIENTO PROVISIONAL: 2.250 g de verduras cocidas, equivalentes a 15 guarniciones de 150 g. Pendiente de confirmar pesando la tanda. Ajustar el rendimiento cuando se conozca.')
WHERE name = 'Verduras horno prod' AND is_sellable = false;

DELETE FROM public.recipe_ingredients
WHERE recipe_id = (SELECT id FROM public.recipes WHERE name = 'Verduras horno' AND is_sellable = true);

INSERT INTO public.recipe_subrecipes (
    parent_recipe_id, child_recipe_id, quantity, unit, format_full_id, format_half_id
)
SELECT sell.id, prod.id, 150, 'g', NULL, NULL
FROM public.recipes sell CROSS JOIN public.recipes prod
WHERE sell.name='Verduras horno' AND sell.is_sellable=true
  AND prod.name='Verduras horno prod' AND prod.is_sellable=false;

DO $check$
DECLARE
  v_sale uuid;
  v_cost numeric;
  v_original numeric;
  v_stock jsonb;
  v_eggplant numeric;
BEGIN
  SELECT id INTO STRICT v_sale FROM public.recipes
    WHERE name = 'Verduras horno' AND is_sellable=true;
  SELECT previous_cost_eur INTO STRICT v_original
  FROM private.recipe_composition_change_audit
  WHERE change_key='20261104_verduras_horno_estimated_2250g';

  IF (public.get_recipe_cost_v2(v_sale)->>'ok')::boolean IS DISTINCT FROM true THEN
     RAISE EXCEPTION 'Coste nuevo de Verduras horno inválido';
  END IF;
  SELECT (public.get_recipe_cost_v2(v_sale)->>'total_cost_eur')::numeric INTO v_cost;
  IF abs(v_cost * 15 - v_original) > 0.02 THEN
     RAISE EXCEPTION 'Coste por guarnición no conserva el coste del lote: % vs %', v_cost, v_original;
  END IF;

  v_stock := public.get_recipe_stock_requirements_v2(v_sale);
  IF (v_stock->>'ok')::boolean IS DISTINCT FROM true
     OR jsonb_array_length(v_stock->'ingredients') <> 8 THEN
     RAISE EXCEPTION 'Requisitos de stock de la guarnición inválidos: %', v_stock;
  END IF;

  SELECT (item->>'quantity_base')::numeric INTO v_eggplant
  FROM jsonb_array_elements(v_stock->'ingredients') item
  WHERE item->>'ingredient_name'='Berenjena';
  IF v_eggplant IS NULL OR abs(v_eggplant - (650::numeric/15)) > 0.00001 THEN
     RAISE EXCEPTION 'La berenjena no se prorratea por la nueva guarnición: %', v_eggplant;
  END IF;

  IF (SELECT count(*) FROM public.recipe_ingredients WHERE recipe_id=v_sale) <> 0 THEN
     RAISE EXCEPTION 'La receta vendible tiene ingredientes directos duplicados';
  END IF;
  IF (SELECT count(*) FROM public.recipe_subrecipes WHERE parent_recipe_id=v_sale
     AND quantity=150 AND unit='g') <> 1 THEN
     RAISE EXCEPTION 'Vínculo con elaboración incompleto';
  END IF;
END;
$check$;

COMMIT;
