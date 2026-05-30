-- Fix: Postgres no resuelve fn_recipe_line_cost cuando las columnas son
-- double precision / varchar sin cast explícito a numeric / text.
-- Afecta get_recipe_cost y get_product_margin_ranking (versión antigua en BD).

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
        ri.quantity_gross::numeric,
        coalesce(ri.quantity_half, 0)::numeric,
        ri.unit::text,
        i.purchase_unit::text,
        i.current_price::numeric,
        p_use_half_ration,
        i.supplier_pricing_mode::text,
        i.pack_unit_size_qty::numeric,
        i.pack_unit_size_unit::text
      ) AS line_cost
    FROM public.recipe_ingredients ri
    JOIN public.ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = p_recipe_id
  )
  SELECT
    coalesce(sum(line_cost), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'line_id', line_id,
          'ingredient_name', ingredient_name,
          'line_cost', round(line_cost::numeric, 2)
        )
      ),
      '[]'::jsonb
    )
  INTO total, lines_agg
  FROM costed;

  RETURN jsonb_build_object(
    'total_cost', round(total::numeric, 2),
    'lines', lines_agg
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_margin_ranking(
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  product_name text,
  total_units_sold numeric,
  avg_sale_price numeric,
  recipe_cost numeric,
  margin_per_unit numeric,
  total_margin_contribution numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := COALESCE(NULLIF(p_limit, 0), 20);
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_limit := LEAST(GREATEST(v_limit, 1), 500);

  RETURN QUERY
  WITH top_products AS (
    SELECT
      tl.articulo_id,
      SUM(tl.unidades)::numeric AS units_sold,
      CASE
        WHEN SUM(tl.unidades) > 0 THEN round(SUM(tl.importe_total) / SUM(tl.unidades), 2)
        ELSE 0::numeric
      END AS sale_price_avg
    FROM public.ticket_lines_marbella tl
    INNER JOIN public.map_tpv_receta m ON m.articulo_id = tl.articulo_id
    GROUP BY tl.articulo_id
    ORDER BY SUM(tl.unidades) DESC
    LIMIT v_limit
  ),
  recipe_unit_costs AS (
    SELECT
      ri.recipe_id,
      round(
        COALESCE(
          SUM(
            COALESCE(
              public.recipe_qty_to_purchase_unit_for_cost(
                ri.quantity_gross::numeric,
                ri.unit::text,
                i.purchase_unit::text,
                i.supplier_pricing_mode::text,
                i.pack_unit_size_qty::numeric,
                i.pack_unit_size_unit::text
              ),
              0
            ) * i.current_price::numeric
          ),
          0
        ),
        2
      ) AS base_recipe_cost
    FROM public.recipe_ingredients ri
    JOIN public.ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id IN (
      SELECT m.recipe_id
      FROM public.map_tpv_receta m
      INNER JOIN top_products tp ON tp.articulo_id = m.articulo_id
    )
    GROUP BY ri.recipe_id
  ),
  sales AS (
    SELECT
      tp.articulo_id,
      COALESCE(
        NULLIF(btrim(a.nombre), ''),
        NULLIF(btrim(r.name), ''),
        'Artículo ' || tp.articulo_id::text
      ) AS pname,
      tp.units_sold,
      tp.sale_price_avg,
      round(
        COALESCE(ruc.base_recipe_cost, 0) * COALESCE(m.factor_porcion, 1),
        2
      ) AS unit_recipe_cost
    FROM top_products tp
    INNER JOIN public.map_tpv_receta m ON m.articulo_id = tp.articulo_id
    LEFT JOIN recipe_unit_costs ruc ON ruc.recipe_id = m.recipe_id
    LEFT JOIN public.bdp_articulos a ON a.id = tp.articulo_id
    LEFT JOIN public.recipes r ON r.id = m.recipe_id
  )
  SELECT
    s.pname AS product_name,
    round(s.units_sold, 3) AS total_units_sold,
    s.sale_price_avg AS avg_sale_price,
    s.unit_recipe_cost AS recipe_cost,
    round(s.sale_price_avg - s.unit_recipe_cost, 2) AS margin_per_unit,
    round((s.sale_price_avg - s.unit_recipe_cost) * s.units_sold, 2) AS total_margin_contribution
  FROM sales s
  ORDER BY total_margin_contribution DESC;
END;
$$;

COMMENT ON FUNCTION public.get_recipe_cost(uuid, boolean) IS
  'Coste total de receta (backend). Casts explícitos para resolver fn_recipe_line_cost con columnas varchar/double precision.';

COMMENT ON FUNCTION public.get_product_margin_ranking(int) IS
  'Margen por producto TPV; top N por unidades, coste vía recipe_qty_to_purchase_unit_for_cost × factor_porcion.';
