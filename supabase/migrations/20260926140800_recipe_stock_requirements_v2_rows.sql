-- Vista relacional de get_recipe_stock_requirements_v2.
-- No recorre recetas, no convierte unidades y no escribe stock.
-- Si ok es false, las cantidades son las del JSON y no son seguras para un writer.

CREATE OR REPLACE FUNCTION public.recipe_stock_requirements_v2_rows(
  p_recipe_id uuid,
  p_recipe_multiplier numeric DEFAULT 1
)
RETURNS TABLE (
  recipe_id uuid,
  recipe_multiplier numeric,
  ok boolean,
  ingredient_count integer,
  ingredient_id uuid,
  ingredient_name text,
  quantity_base numeric,
  unit_base text,
  contributions jsonb,
  errors jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH payload AS MATERIALIZED (
    SELECT public.get_recipe_stock_requirements_v2(
      p_recipe_id,
      p_recipe_multiplier
    ) AS doc
  )
  SELECT
    (payload.doc->>'recipe_id')::uuid,
    (payload.doc->>'recipe_multiplier')::numeric,
    (payload.doc->>'ok')::boolean,
    COALESCE(
      jsonb_array_length(
        CASE
          WHEN jsonb_typeof(payload.doc->'ingredients') = 'array'
          THEN payload.doc->'ingredients'
        END
      ),
      0
    ),
    (item->>'ingredient_id')::uuid,
    item->>'ingredient_name',
    (item->>'quantity_base')::numeric,
    item->>'unit_base',
    item->'contributions',
    payload.doc->'errors'
  FROM payload
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(payload.doc->'ingredients') = 'array'
      THEN payload.doc->'ingredients'
      ELSE '[]'::jsonb
    END
  ) AS item ON true;
$$;

COMMENT ON FUNCTION public.recipe_stock_requirements_v2_rows(uuid, numeric) IS
  'Wrapper relacional de get_recipe_stock_requirements_v2. No es un segundo motor: llama una vez al JSON canónico. Si ok es false, las cantidades no son seguras para escribir stock.';

REVOKE ALL ON FUNCTION public.recipe_stock_requirements_v2_rows(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recipe_stock_requirements_v2_rows(uuid, numeric) TO authenticated, service_role;
