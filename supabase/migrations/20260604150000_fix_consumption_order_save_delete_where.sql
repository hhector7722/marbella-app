-- Fix: Supabase/Postgres exige WHERE en DELETE ("DELETE requires a WHERE clause").

CREATE OR REPLACE FUNCTION public.save_staff_consumption_recipe_display_order(p_ordered_recipe_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_len integer;
BEGIN
  IF NOT public.is_hector_consumption_order_editor() THEN
    RAISE EXCEPTION 'No autorizado: solo Hector puede modificar el orden';
  END IF;

  v_len := COALESCE(array_length(p_ordered_recipe_ids, 1), 0);
  IF v_len = 0 THEN
    RAISE EXCEPTION 'La lista de productos no puede estar vacía';
  END IF;

  INSERT INTO public.staff_consumption_recipe_display_order (recipe_id, sort_order, updated_at)
  SELECT
    rid,
    (ord - 1) * 10,
    now()
  FROM unnest(p_ordered_recipe_ids) WITH ORDINALITY AS t(rid, ord)
  ON CONFLICT (recipe_id) DO UPDATE SET
    sort_order = EXCLUDED.sort_order,
    updated_at = EXCLUDED.updated_at;

  DELETE FROM public.staff_consumption_recipe_display_order o
  WHERE o.recipe_id <> ALL (p_ordered_recipe_ids);
END;
$$;

COMMENT ON FUNCTION public.save_staff_consumption_recipe_display_order(uuid[]) IS
  'Persiste orden manual consumo personal (solo Hector). Upsert + borra filas fuera de la lista.';
