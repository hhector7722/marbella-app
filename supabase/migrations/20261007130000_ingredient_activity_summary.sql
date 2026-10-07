-- Resumen agregado de actividad de un ingrediente para la ficha.
--
-- La card «ACTIVIDAD» no descarga el histórico completo: pide un único JSON
-- ya agregado por Postgres. La fuente económica es
-- `purchase_receipt_confirmations` (el hecho atómico de K4), que guarda la
-- cantidad y el precio normalizados a la unidad de compra del ingrediente.
--
-- La función es SECURITY INVOKER: respeta las políticas de acceso existentes.
-- `purchase_receipt_confirmations` solo la lee manager/admin, que es quien
-- puede abrir la ficha de ingrediente (el guardián de rutas redirige a
-- staff/supervisor). No se concede nada a `anon`.
--
-- El histórico detallado (compras, cambios de precio, albaranes) sigue
-- saliendo de `purchase_invoice_lines` + `ingredient_price_history`, pero solo
-- se consulta cuando la persona pulsa «Ver historial».

-- Soporte de la consulta agregada por ingrediente y fecha de confirmación.
CREATE INDEX IF NOT EXISTS purchase_receipt_confirmations_ingredient_idx
  ON public.purchase_receipt_confirmations (ingredient_id, confirmed_at DESC);

CREATE OR REPLACE FUNCTION public.get_ingredient_activity(
  p_ingredient_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_days integer := GREATEST(COALESCE(p_days, 30), 1);
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_from date := v_today - (v_days - 1);
  v_prev_from date := v_from - v_days;
  v_purchase_unit text;
  v_base_unit text;
  v_current_price numeric;
  v_purchases integer := 0;
  v_total_quantity numeric := 0;
  v_avg_price numeric;
  v_prev_price numeric;
  v_variation numeric;
  v_last jsonb;
  v_points jsonb := '[]'::jsonb;
BEGIN
  SELECT
    COALESCE(private.k4_normalize_unit(i.purchase_unit), 'ud'),
    COALESCE(private.k4_normalize_unit(i.base_unit), 'ud'),
    i.current_price
  INTO v_purchase_unit, v_base_unit, v_current_price
  FROM public.ingredients i
  WHERE i.id = p_ingredient_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- Periodo solicitado. Solo se agregan recepciones en la unidad de compra
  -- vigente del ingrediente: mezclar unidades produciría una media falsa.
  SELECT
    count(*),
    COALESCE(sum(c.purchase_quantity), 0),
    CASE
      WHEN sum(c.purchase_quantity) > 0
        THEN sum(c.normalized_unit_price * c.purchase_quantity) / sum(c.purchase_quantity)
      ELSE NULL
    END
  INTO v_purchases, v_total_quantity, v_avg_price
  FROM public.purchase_receipt_confirmations c
  JOIN public.purchase_invoices pi ON pi.id = c.purchase_invoice_id
  WHERE c.ingredient_id = p_ingredient_id
    AND c.purchase_unit = v_purchase_unit
    AND COALESCE(pi.invoice_date, (c.confirmed_at AT TIME ZONE 'Europe/Madrid')::date)
        BETWEEN v_from AND v_today;

  -- Periodo inmediatamente anterior equivalente, para la variación.
  SELECT
    CASE
      WHEN sum(c.purchase_quantity) > 0
        THEN sum(c.normalized_unit_price * c.purchase_quantity) / sum(c.purchase_quantity)
      ELSE NULL
    END
  INTO v_prev_price
  FROM public.purchase_receipt_confirmations c
  JOIN public.purchase_invoices pi ON pi.id = c.purchase_invoice_id
  WHERE c.ingredient_id = p_ingredient_id
    AND c.purchase_unit = v_purchase_unit
    AND COALESCE(pi.invoice_date, (c.confirmed_at AT TIME ZONE 'Europe/Madrid')::date) >= v_prev_from
    AND COALESCE(pi.invoice_date, (c.confirmed_at AT TIME ZONE 'Europe/Madrid')::date) < v_from;

  -- Última compra del periodo: fecha, proveedor y precio normalizado.
  SELECT jsonb_build_object(
           'date', COALESCE(pi.invoice_date, (c.confirmed_at AT TIME ZONE 'Europe/Madrid')::date),
           'supplier', s.name,
           'unit_price', c.normalized_unit_price
         )
  INTO v_last
  FROM public.purchase_receipt_confirmations c
  JOIN public.purchase_invoices pi ON pi.id = c.purchase_invoice_id
  LEFT JOIN public.suppliers s ON s.id = c.supplier_id
  WHERE c.ingredient_id = p_ingredient_id
    AND c.purchase_unit = v_purchase_unit
    AND COALESCE(pi.invoice_date, (c.confirmed_at AT TIME ZONE 'Europe/Madrid')::date)
        BETWEEN v_from AND v_today
  ORDER BY
    COALESCE(pi.invoice_date, (c.confirmed_at AT TIME ZONE 'Europe/Madrid')::date) DESC,
    c.confirmed_at DESC
  LIMIT 1;

  -- Micrográfica: como máximo 30 puntos del periodo, en orden cronológico.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('date', t.d, 'price', t.p)
             ORDER BY t.d, t.confirmed_at
           ),
           '[]'::jsonb
         )
  INTO v_points
  FROM (
    SELECT
      COALESCE(pi.invoice_date, (c.confirmed_at AT TIME ZONE 'Europe/Madrid')::date) AS d,
      c.normalized_unit_price AS p,
      c.confirmed_at
    FROM public.purchase_receipt_confirmations c
    JOIN public.purchase_invoices pi ON pi.id = c.purchase_invoice_id
    WHERE c.ingredient_id = p_ingredient_id
      AND c.purchase_unit = v_purchase_unit
      AND COALESCE(pi.invoice_date, (c.confirmed_at AT TIME ZONE 'Europe/Madrid')::date)
          BETWEEN v_from AND v_today
    ORDER BY
      COALESCE(pi.invoice_date, (c.confirmed_at AT TIME ZONE 'Europe/Madrid')::date) DESC,
      c.confirmed_at DESC
    LIMIT 30
  ) t;

  IF v_prev_price IS NOT NULL AND v_prev_price > 0 AND v_current_price IS NOT NULL THEN
    v_variation := ((v_current_price - v_prev_price) / v_prev_price) * 100;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'period_days', v_days,
    'purchases', v_purchases,
    'total_quantity', v_total_quantity,
    'purchase_unit', v_purchase_unit,
    'base_unit', v_base_unit,
    'avg_price', v_avg_price,
    'previous_avg_price', v_prev_price,
    'current_price', v_current_price,
    'variation_percent', v_variation,
    'last_purchase', v_last,
    'points', v_points
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ingredient_activity(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ingredient_activity(uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_ingredient_activity(uuid, integer) IS
  'Resumen agregado de compras de un ingrediente en los últimos N días (por defecto 30): número de compras, cantidad, precio medio ponderado, variación frente al periodo anterior, última compra y puntos de precio para la micrográfica. Solo lee; respeta RLS.';
