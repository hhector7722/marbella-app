-- Solo Hector (hhector7722@gmail.com) puede guardar el orden manual de consumo personal.

CREATE OR REPLACE FUNCTION public.is_hector_consumption_order_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(trim(COALESCE(
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()),
    ''
  ))) = 'hhector7722@gmail.com';
$$;

COMMENT ON FUNCTION public.is_hector_consumption_order_editor() IS
  'True si el usuario autenticado es Hector (orden modal consumo personal).';

GRANT EXECUTE ON FUNCTION public.is_hector_consumption_order_editor() TO authenticated;


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

  DELETE FROM public.staff_consumption_recipe_display_order;

  INSERT INTO public.staff_consumption_recipe_display_order (recipe_id, sort_order, updated_at)
  SELECT
    rid,
    (ord - 1) * 10,
    now()
  FROM unnest(p_ordered_recipe_ids) WITH ORDINALITY AS t(rid, ord);
END;
$$;


DROP POLICY IF EXISTS staff_consumption_recipe_display_order_manager_write ON public.staff_consumption_recipe_display_order;

CREATE POLICY staff_consumption_recipe_display_order_hector_write
  ON public.staff_consumption_recipe_display_order
  FOR ALL
  TO authenticated
  USING (public.is_hector_consumption_order_editor())
  WITH CHECK (public.is_hector_consumption_order_editor());
