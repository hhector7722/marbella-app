-- Modal consumo personal: orden visual global (base Hector) + pequeño boost por uso.

CREATE OR REPLACE FUNCTION public.get_consumption_modal_recipes()
RETURNS TABLE(
  id uuid,
  name text,
  category text,
  photo_url text,
  sort_order integer,
  usage_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.name,
    r.category,
    r.photo_url,
    COALESCE(o.sort_order, 999999) AS sort_order,
    COALESCE(u.usage_count, 0::bigint) AS usage_count
  FROM public.recipes r
  LEFT JOIN public.staff_consumption_recipe_display_order o ON o.recipe_id = r.id
  LEFT JOIN public.staff_consumption_recipe_usage_counts() u ON u.recipe_id = r.id
  ORDER BY
    (
      COALESCE(o.sort_order, 999999)
      - LEAST(COALESCE(u.usage_count, 0)::integer, 80) * 3
    ) ASC,
    r.name ASC;
$$;

COMMENT ON FUNCTION public.get_consumption_modal_recipes() IS
  'Recetas del modal fichaje (todos los trabajadores): orden base global guardado por Hector, con boost por veces consumidas.';
