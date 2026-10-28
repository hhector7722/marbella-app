-- Las unidades del widget se calculan solo para los tres tramos visibles.
-- El filtro y el modal siguen cargando sus propios desgloses completos.
CREATE OR REPLACE FUNCTION public.get_home_sales_visible_hour_units(
  p_date date,
  p_hours integer[]
)
RETURNS TABLE (hora integer, unidades numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH visible_hours AS (
    SELECT DISTINCT hour_value
    FROM unnest(p_hours) AS requested(hour_value)
    WHERE hour_value BETWEEN 7 AND 23
    LIMIT 3
  )
  SELECT
    h.hour_value AS hora,
    COALESCE(SUM(l.unidades), 0)::numeric AS unidades
  FROM visible_hours h
  LEFT JOIN public.tickets_marbella t
    ON t.fecha = p_date
   AND EXTRACT(HOUR FROM timezone('Europe/Madrid',
     public.fn_parse_ticket_hora_cierre_ts(t.fecha, t.hora_cierre, t.fecha_real)
   ))::integer = h.hour_value
  LEFT JOIN public.ticket_lines_marbella l
    ON l.numero_documento = t.numero_documento
   AND l.fecha_negocio = p_date
  GROUP BY h.hour_value
  ORDER BY h.hour_value;
$$;

REVOKE ALL ON FUNCTION public.get_home_sales_visible_hour_units(date, integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_home_sales_visible_hour_units(date, integer[]) TO authenticated, service_role;
