-- Excluir documentos Indexx "COMPROBANTE" (no son ventas) del desglose de cierre.
-- Limpia la fila huérfana reutilizada como PK única.

DELETE FROM public.ticket_lines_marbella
WHERE upper(trim(numero_documento)) = 'COMPROBANTE';

DELETE FROM public.tickets_marbella
WHERE upper(trim(numero_documento)) = 'COMPROBANTE';

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
  v_tarjeta numeric := 0;
  v_pendiente numeric := 0;
  v_cobros_deuda numeric := 0;
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
  INTO v_bruto, v_efectivo, v_tarjeta, v_pendiente, v_recuento
  FROM public.tickets_marbella t
  WHERE (t.fecha)::date = p_date
    AND upper(trim(t.numero_documento)) <> 'COMPROBANTE';

  SELECT COALESCE(round(sum(m.amount)::numeric, 2), 0)
  INTO v_cobros_deuda
  FROM public.bdp_cash_movements m
  WHERE m.fecha_negocio = p_date
    AND m.concept_code = 107;

  RETURN jsonb_build_object(
    'total_bruto', v_bruto,
    'total_efectivo', v_efectivo,
    'total_tarjeta', v_tarjeta,
    'total_pendiente', v_pendiente,
    'total_cobros_deuda', v_cobros_deuda,
    'recuento_tickets', v_recuento
  );
END;
$$;

COMMENT ON FUNCTION public.get_closing_sales_breakdown(date) IS
  'Desglose cierre caja por fecha. Excluye Numero_Documento COMPROBANTE (impresión Indexx, no venta).';

GRANT EXECUTE ON FUNCTION public.get_closing_sales_breakdown(date) TO authenticated, service_role;
