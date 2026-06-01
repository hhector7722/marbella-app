-- get_product_margin_ranking: exponer recipe_id para enlace a /recipes/[id]

DROP FUNCTION IF EXISTS public.get_product_margin_ranking(int, date, date);

CREATE OR REPLACE FUNCTION public.get_product_margin_ranking(
  p_limit int DEFAULT 20,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  product_name text,
  recipe_id uuid,
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

  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_from > p_date_to THEN
    RAISE EXCEPTION 'get_product_margin_ranking: p_date_from no puede ser posterior a p_date_to';
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
    WHERE (p_date_from IS NULL OR COALESCE((timezone('Europe/Madrid', tl.fecha_real))::date, tl.fecha_negocio) >= p_date_from)
      AND (p_date_to IS NULL OR COALESCE((timezone('Europe/Madrid', tl.fecha_real))::date, tl.fecha_negocio) <= p_date_to)
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
      m.recipe_id,
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
    s.recipe_id,
    round(s.units_sold, 3) AS total_units_sold,
    s.sale_price_avg AS avg_sale_price,
    s.unit_recipe_cost AS recipe_cost,
    round(s.sale_price_avg - s.unit_recipe_cost, 2) AS margin_per_unit,
    round((s.sale_price_avg - s.unit_recipe_cost) * s.units_sold, 2) AS total_margin_contribution
  FROM sales s
  ORDER BY total_margin_contribution DESC;
END;
$$;

COMMENT ON FUNCTION public.get_product_margin_ranking(int, date, date) IS
  'Margen por producto TPV con receta; incluye recipe_id para enlace UI.';

GRANT EXECUTE ON FUNCTION public.get_product_margin_ranking(int, date, date) TO authenticated, service_role;
