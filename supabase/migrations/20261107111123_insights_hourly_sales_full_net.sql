-- Insights: calcular todas las ventas netas por hora dentro de PostgreSQL.
-- Una única fila por hora evita truncamientos de PostgREST (por defecto 1.000/2.000 tickets).
-- Ventas netas: misma regla fiscal por ticket que get_financial_statement.
CREATE OR REPLACE FUNCTION public.get_insights_hourly_ticket_sales(
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  hour integer,
  total_revenue numeric,
  ticket_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_date_from IS NULL OR p_date_to IS NULL OR p_date_to < p_date_from THEN
    RAISE EXCEPTION 'get_insights_hourly_ticket_sales: rango de fechas inválido';
  END IF;

  RETURN QUERY
  SELECT
    EXTRACT(
      HOUR FROM timezone(
        'Europe/Madrid',
        public.fn_parse_ticket_hora_cierre_ts(t.fecha, t.hora_cierre, t.fecha_real)
      )
    )::integer AS hour,
    ROUND(SUM(ROUND(t.total_documento / 1.10, 2)), 2)::numeric AS total_revenue,
    COUNT(*)::integer AS ticket_count
  FROM public.tickets_marbella AS t
  WHERE t.fecha BETWEEN p_date_from AND p_date_to
  GROUP BY 1
  ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_insights_hourly_ticket_sales(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_insights_hourly_ticket_sales(date, date) TO authenticated;
