-- Inventario · La línea capturada conserva el desglose por ubicación.
--
-- La persona que cuenta introduce la cantidad de barra y la de cámara; el
-- total (physical_stock) y la teórica (theoretical_stock) siguen siendo el
-- hecho que certifica gerencia. La revisión del pendiente muestra solo lo
-- contado, desglosado por ubicación, sin compararlo con el stock teórico.

ALTER TABLE public.inventory_count_lines
  ADD COLUMN IF NOT EXISTS quantity_barra numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity_camara numeric NOT NULL DEFAULT 0;

-- Captura: cualquier persona autenticada. Sustituye su recuento pendiente
-- anterior (uno por persona) para no acumular borradores. Guarda el desglose
-- por ubicación además del total.
CREATE OR REPLACE FUNCTION public.submit_inventory_count(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count_id uuid;
  v_lines integer := 0;
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

  DELETE FROM public.inventory_counts
  WHERE created_by = auth.uid() AND status = 'pending';

  INSERT INTO public.inventory_counts (created_by)
  VALUES (auth.uid())
  RETURNING id INTO v_count_id;

  INSERT INTO public.inventory_count_lines
    (count_id, ingredient_id, physical_stock, theoretical_stock, unit, quantity_barra, quantity_camara)
  SELECT
    v_count_id,
    (item->>'ingredient_id')::uuid,
    (item->>'physical_stock')::numeric,
    coalesce((item->>'theoretical_stock')::numeric, 0),
    btrim(item->>'unit'),
    coalesce((item->>'quantity_barra')::numeric, 0),
    coalesce((item->>'quantity_camara')::numeric, 0)
  FROM jsonb_array_elements(p_items) AS item;

  GET DIAGNOSTICS v_lines = ROW_COUNT;

  RETURN jsonb_build_object('count_id', v_count_id, 'line_count', v_lines);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_inventory_count(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_inventory_count(jsonb) TO authenticated;
