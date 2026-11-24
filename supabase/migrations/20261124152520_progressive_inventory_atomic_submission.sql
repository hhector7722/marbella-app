-- Atomic capture and reset of the shared progressive draft.
CREATE OR REPLACE FUNCTION public.submit_inventory_count(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count_id uuid;
  v_lines integer := 0;
  v_progressive boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado para guardar un recuento';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El recuento requiere al menos una línea';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS item
    WHERE jsonb_typeof(item) <> 'object'
       OR coalesce(item->>'ingredient_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR jsonb_typeof(item->'physical_stock') <> 'number'
       OR btrim(coalesce(item->>'unit', '')) = ''
  ) THEN
    RAISE EXCEPTION 'Línea de recuento inválida';
  END IF;

  SELECT coalesce(bool_and(item->>'progressive' = 'true'),false) INTO v_progressive FROM jsonb_array_elements(p_items) AS item;
  IF v_progressive THEN
    -- Capture the exact shared draft and prevent a concurrent edit during submission.
    LOCK TABLE public.inventory_count_drafts IN SHARE ROW EXCLUSIVE MODE;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_items) AS item
      LEFT JOIN public.inventory_count_drafts d ON d.ingredient_id=(item->>'ingredient_id')::uuid
      WHERE coalesce(d.quantity_barra,0) IS DISTINCT FROM coalesce((item->>'quantity_barra')::numeric,0)
         OR coalesce(d.quantity_camara,0) IS DISTINCT FROM coalesce((item->>'quantity_camara')::numeric,0)
    ) THEN
      RAISE EXCEPTION 'El borrador ha cambiado en otro dispositivo. Revisa el recuento actualizado y vuelve a guardar.';
    END IF;
  END IF;

  DELETE FROM public.inventory_counts
  WHERE created_by = auth.uid() AND status = 'pending';

  INSERT INTO public.inventory_counts (created_by)
  VALUES (auth.uid())
  RETURNING id INTO v_count_id;

  INSERT INTO public.inventory_count_lines
    (count_id, ingredient_id, physical_stock, theoretical_stock, unit, quantity_barra, quantity_camara, barra_counted_at, camara_counted_at)
  SELECT
    v_count_id,
    (item->>'ingredient_id')::uuid,
    (item->>'physical_stock')::numeric,
    coalesce((item->>'theoretical_stock')::numeric, 0),
    btrim(item->>'unit'),
    coalesce((item->>'quantity_barra')::numeric, 0),
    coalesce((item->>'quantity_camara')::numeric, 0),
    CASE WHEN item->>'progressive' = 'true' THEN coalesce(CASE WHEN d.quantity_barra = coalesce((item->>'quantity_barra')::numeric,0) THEN d.barra_counted_at END, c.created_at) END,
    CASE WHEN item->>'progressive' = 'true' THEN coalesce(CASE WHEN d.quantity_camara = coalesce((item->>'quantity_camara')::numeric,0) THEN d.camara_counted_at END, c.created_at) END
  FROM jsonb_array_elements(p_items) AS item
  JOIN public.inventory_counts c ON c.id = v_count_id
  LEFT JOIN public.inventory_count_drafts d ON d.ingredient_id=(item->>'ingredient_id')::uuid;

  GET DIAGNOSTICS v_lines = ROW_COUNT;
  IF v_progressive THEN DELETE FROM public.inventory_count_drafts; END IF;

  RETURN jsonb_build_object('count_id', v_count_id, 'line_count', v_lines);
END;
$function$;
