-- B9.4. El ranking de margen lee el coste recursivo una vez por receta.
-- Un coste inválido, o un payload sin materia prima, queda en blanco.
-- No se sustituye por 0 €. get_recipe_cost_v2 no cambia.

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
  distinct_recipes AS (
    SELECT DISTINCT m.recipe_id
    FROM public.map_tpv_receta m
    INNER JOIN top_products tp ON tp.articulo_id = m.articulo_id
  ),
  recipe_cost_payloads AS MATERIALIZED (
    SELECT
      dr.recipe_id,
      public.get_recipe_cost_v2(dr.recipe_id) AS payload
    FROM distinct_recipes dr
  ),
  recipe_cost_basis AS (
    SELECT
      rcp.recipe_id,
      rcp.payload,
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(rcp.payload->'components', '[]'::jsonb)) AS component
        WHERE component->>'kind' = 'ingredient'
      ) AS has_cost_basis
    FROM recipe_cost_payloads rcp
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
      CASE
        WHEN COALESCE((rcb.payload->>'ok')::boolean, false)
          AND rcb.payload->>'total_cost_eur' IS NOT NULL
          AND rcb.has_cost_basis
          AND m.factor_porcion IS NOT NULL
          AND m.factor_porcion > 0
          AND m.factor_porcion <> 'NaN'::numeric
          AND m.factor_porcion <> 'Infinity'::numeric
          AND m.factor_porcion <> '-Infinity'::numeric
          AND (rcb.payload->>'total_cost_eur')::numeric <> 'NaN'::numeric
          AND (rcb.payload->>'total_cost_eur')::numeric <> 'Infinity'::numeric
          AND (rcb.payload->>'total_cost_eur')::numeric <> '-Infinity'::numeric
        THEN round((rcb.payload->>'total_cost_eur')::numeric * m.factor_porcion, 2)
        ELSE NULL
      END AS unit_recipe_cost
    FROM top_products tp
    INNER JOIN public.map_tpv_receta m ON m.articulo_id = tp.articulo_id
    LEFT JOIN recipe_cost_basis rcb ON rcb.recipe_id = m.recipe_id
    LEFT JOIN public.bdp_articulos a ON a.id = tp.articulo_id
    LEFT JOIN public.recipes r ON r.id = m.recipe_id
  )
  SELECT
    s.pname AS product_name,
    s.recipe_id,
    round(s.units_sold, 3) AS total_units_sold,
    s.sale_price_avg AS avg_sale_price,
    s.unit_recipe_cost AS recipe_cost,
    CASE
      WHEN s.unit_recipe_cost IS NULL THEN NULL
      ELSE round(s.sale_price_avg - s.unit_recipe_cost, 2)
    END AS margin_per_unit,
    CASE
      WHEN s.unit_recipe_cost IS NULL THEN NULL
      ELSE round((s.sale_price_avg - s.unit_recipe_cost) * s.units_sold, 2)
    END AS total_margin_contribution
  FROM sales s
  ORDER BY total_margin_contribution DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_product_margin_ranking(int, date, date) IS
  'Margen por producto TPV. El coste sale de get_recipe_cost_v2, una vez por receta. Sin materia prima en el payload, o con coste inválido, el margen queda en blanco.';

GRANT EXECUTE ON FUNCTION public.get_product_margin_ranking(int, date, date) TO authenticated, service_role;
