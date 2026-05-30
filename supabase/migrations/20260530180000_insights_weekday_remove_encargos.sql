-- Insights: quitar contraste con/sin "evento" (tabla events = encargos, no eventos reales).

CREATE OR REPLACE FUNCTION public.get_weekday_ticket_analysis(
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  weekday int,
  weekday_name text,
  avg_revenue numeric,
  avg_tickets numeric,
  avg_ticket_value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'get_weekday_ticket_analysis: p_date_from y p_date_to son obligatorios';
  END IF;

  IF p_date_from > p_date_to THEN
    RAISE EXCEPTION 'get_weekday_ticket_analysis: p_date_from no puede ser posterior a p_date_to';
  END IF;

  RETURN QUERY
  WITH calendar AS (
    SELECT gs.d::date AS biz_date
    FROM generate_series(p_date_from, p_date_to, interval '1 day') AS gs(d)
  ),
  daily AS (
    SELECT
      c.biz_date,
      (EXTRACT(ISODOW FROM c.biz_date)::int - 1) AS wd,
      COALESCE(SUM(t.total_documento), 0)::numeric AS revenue,
      COUNT(t.numero_documento)::numeric AS tickets
    FROM calendar c
    LEFT JOIN public.tickets_marbella t
      ON (t.fecha)::date = c.biz_date
    GROUP BY c.biz_date
  )
  SELECT
    w.wd AS weekday,
    (
      ARRAY[
        'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'
      ]
    )[w.wd + 1] AS weekday_name,
    round(COALESCE(AVG(d.revenue), 0), 2) AS avg_revenue,
    round(COALESCE(AVG(d.tickets), 0), 2) AS avg_tickets,
    CASE
      WHEN COALESCE(AVG(d.tickets), 0) > 0
        THEN round(COALESCE(AVG(d.revenue), 0) / AVG(d.tickets), 2)
      ELSE 0::numeric
    END AS avg_ticket_value
  FROM generate_series(0, 6) AS w(wd)
  LEFT JOIN daily d ON d.wd = w.wd
  GROUP BY w.wd
  ORDER BY w.wd;
END;
$$;

COMMENT ON FUNCTION public.get_weekday_ticket_analysis(date, date) IS
  'Promedios por weekday ISO (0=lunes): ventas diarias y ticket medio en el rango.';
