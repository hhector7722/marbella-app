-- Ración medio: nombre «1/2 PRODUCTO», sin notes '1/2' (evita duplicar en comanda).

CREATE OR REPLACE FUNCTION public.fn_event_order_apply_racion(
  p_product_id text,
  p_name text,
  p_price numeric,
  p_is_half boolean DEFAULT false
)
RETURNS TABLE(out_name text, out_price numeric, out_notes text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_medio numeric;
  v_name text;
BEGIN
  IF p_is_half IS DISTINCT FROM true THEN
    RETURN QUERY SELECT p_name, p_price, NULL::text;
    RETURN;
  END IF;

  SELECT o.override_precio_medio
  INTO v_medio
  FROM public.digital_menu_overrides o
  WHERE o.articulo_id::text = p_product_id
    AND coalesce(o.carta_dual_racion_enabled, false) = true
  LIMIT 1;

  IF v_medio IS NULL OR v_medio <= 0 THEN
    SELECT v.override_precio_medio::numeric
    INTO v_medio
    FROM public.v_public_menu_items v
    WHERE v.articulo_id::text = p_product_id
      AND coalesce(v.carta_dual_racion_enabled, false) = true
    LIMIT 1;
  END IF;

  IF v_medio IS NULL OR v_medio <= 0 THEN
    RAISE EXCEPTION 'producto_medio_no_disponible: %', p_product_id;
  END IF;

  v_name := coalesce(nullif(trim(p_name), ''), 'Producto');
  -- Quitar prefijo 1/2 previo (· o espacio) para no duplicar
  v_name := regexp_replace(v_name, '^\s*(1/2|½)\s*[·.\-]?\s*', '', 'i');
  v_name := trim(regexp_replace(v_name, '\s+', ' ', 'g'));
  v_name := '1/2 ' || v_name;

  -- La ración va en el nombre; notes NULL (comanda no muestra 1/2 otra vez)
  RETURN QUERY SELECT v_name, v_medio, NULL::text;
END;
$$;
