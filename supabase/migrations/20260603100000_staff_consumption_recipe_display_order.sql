-- Consumo personal (modal fichaje salida): orden manual base + ranking por frecuencia de uso.

CREATE TABLE IF NOT EXISTS public.staff_consumption_recipe_display_order (
  recipe_id uuid PRIMARY KEY REFERENCES public.recipes(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_consumption_recipe_display_order_sort
  ON public.staff_consumption_recipe_display_order (sort_order);

COMMENT ON TABLE public.staff_consumption_recipe_display_order IS
  'Orden base de productos en el modal de consumo personal al fichar salida. El listado final prioriza frecuencia de uso y usa sort_order como desempate.';

ALTER TABLE public.staff_consumption_recipe_display_order ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_consumption_recipe_display_order_select ON public.staff_consumption_recipe_display_order;
CREATE POLICY staff_consumption_recipe_display_order_select
  ON public.staff_consumption_recipe_display_order
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS staff_consumption_recipe_display_order_manager_write ON public.staff_consumption_recipe_display_order;
CREATE POLICY staff_consumption_recipe_display_order_manager_write
  ON public.staff_consumption_recipe_display_order
  FOR ALL
  TO authenticated
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());


CREATE OR REPLACE FUNCTION public.staff_consumption_recipe_usage_counts()
RETURNS TABLE(recipe_id uuid, usage_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id AS recipe_id,
    COUNT(DISTINCT sm.reference_doc)::bigint AS usage_count
  FROM public.stock_movements sm
  JOIN public.recipes r ON sm.original_description = 'Consumo Personal: ' || r.name
  WHERE sm.movement_type = 'WASTE'
    AND sm.reference_doc LIKE 'STAFF-%'
    AND sm.original_description LIKE 'Consumo Personal:%'
  GROUP BY r.id;
$$;

COMMENT ON FUNCTION public.staff_consumption_recipe_usage_counts() IS
  'Veces que cada receta apareció en un fichaje de consumo personal (por reference_doc STAFF-*).';

GRANT EXECUTE ON FUNCTION public.staff_consumption_recipe_usage_counts() TO authenticated;


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
    COALESCE(u.usage_count, 0::bigint) DESC,
    COALESCE(o.sort_order, 999999) ASC,
    r.name ASC;
$$;

COMMENT ON FUNCTION public.get_consumption_modal_recipes() IS
  'Recetas para el modal de consumo personal: primero por veces consumidas, desempate por orden manual base.';

GRANT EXECUTE ON FUNCTION public.get_consumption_modal_recipes() TO authenticated;


CREATE OR REPLACE FUNCTION public.save_staff_consumption_recipe_display_order(p_ordered_recipe_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_len integer;
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_len := COALESCE(array_length(p_ordered_recipe_ids, 1), 0);
  IF v_len = 0 THEN
    RAISE EXCEPTION 'La lista de productos no puede estar vacía';
  END IF;

  DELETE FROM public.staff_consumption_recipe_display_order;

  INSERT INTO public.staff_consumption_recipe_display_order (recipe_id, sort_order, updated_at)
  SELECT
    rid,
    (ord - 1) * 10,
    now()
  FROM unnest(p_ordered_recipe_ids) WITH ORDINALITY AS t(rid, ord);
END;
$$;

COMMENT ON FUNCTION public.save_staff_consumption_recipe_display_order(uuid[]) IS
  'Persiste el orden manual base (gestor/admin). sort_order = índice * 10.';

GRANT EXECUTE ON FUNCTION public.save_staff_consumption_recipe_display_order(uuid[]) TO authenticated;
