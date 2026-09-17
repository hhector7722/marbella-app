-- Tarjeta del cierre incluye cobros de otra fecha pagados hoy con datáfono.
-- Cobros: tickets de otro día cobrados hoy; si aún no están, concepto 107.

CREATE OR REPLACE FUNCTION public.get_closing_sales_breakdown(p_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bruto numeric := 0;
  v_efectivo numeric := 0;
  v_tarjeta_venta numeric := 0;
  v_tarjeta_cobros numeric := 0;
  v_pendiente numeric := 0;
  v_cobros_tickets numeric := 0;
  v_cobros_deuda numeric := 0;
  v_cobros numeric := 0;
  v_tarjeta numeric := 0;
  v_recuento integer := 0;
BEGIN
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'get_closing_sales_breakdown: p_date es obligatorio';
  END IF;

  SELECT
    COALESCE(round(sum(t.total_documento)::numeric, 2), 0),
    COALESCE(round(sum(t.cobro_efectivo)::numeric, 2), 0),
    COALESCE(round(sum(t.cobro_tarjeta)::numeric, 2), 0),
    COALESCE(round(sum(t.cobro_pendiente)::numeric, 2), 0),
    COALESCE(count(*) FILTER (WHERE t.total_documento <> 0), 0)::integer
  INTO v_bruto, v_efectivo, v_tarjeta_venta, v_pendiente, v_recuento
  FROM public.tickets_marbella t
  WHERE t.fecha = p_date
    AND upper(trim(t.numero_documento)) <> 'COMPROBANTE';

  SELECT
    COALESCE(round(sum(t.cobro_efectivo + t.cobro_tarjeta)::numeric, 2), 0),
    COALESCE(round(sum(t.cobro_tarjeta)::numeric, 2), 0)
  INTO v_cobros_tickets, v_tarjeta_cobros
  FROM public.tickets_marbella t
  WHERE t.fecha <> p_date
    AND upper(trim(t.numero_documento)) <> 'COMPROBANTE'
    AND (t.cobro_efectivo + t.cobro_tarjeta) > 0
    AND t.hora_cierre ~ '^[0-9]{4}-'
    AND ((t.hora_cierre::timestamptz) AT TIME ZONE 'Europe/Madrid')::date = p_date;

  SELECT COALESCE(round(sum(m.amount)::numeric, 2), 0)
  INTO v_cobros_deuda
  FROM public.bdp_cash_movements m
  WHERE m.fecha_negocio = p_date
    AND m.concept_code = 107;

  IF v_cobros_tickets > 0.005 THEN
    v_cobros := v_cobros_tickets;
  ELSE
    v_cobros := v_cobros_deuda;
  END IF;

  v_tarjeta := round(v_tarjeta_venta + v_tarjeta_cobros, 2);

  RETURN jsonb_build_object(
    'total_bruto', v_bruto,
    'total_efectivo', v_efectivo,
    'total_tarjeta_venta', v_tarjeta_venta,
    'total_tarjeta_cobros', v_tarjeta_cobros,
    'total_tarjeta', v_tarjeta,
    'total_pendiente', v_pendiente,
    'total_cobros_tickets', v_cobros_tickets,
    'total_cobros_deuda', v_cobros_deuda,
    'total_cobros', v_cobros,
    'recuento_tickets', v_recuento
  );
END;
$$;

COMMENT ON FUNCTION public.get_closing_sales_breakdown(date) IS
  'Desglose cierre: ventas del día; tarjeta = datáfonos de hoy (venta + cobros de otra fecha); cobros = deuda antigua cobrada hoy. Excluye COMPROBANTE.';

GRANT EXECUTE ON FUNCTION public.get_closing_sales_breakdown(date) TO authenticated, service_role;
