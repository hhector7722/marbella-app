-- Fix get_hourly_sales: convertir hora_cierre (ISO UTC) a Europe/Madrid.
-- La columna hora_cierre almacena timestamps ISO UTC (del bridge TPV).
-- La versión revert extraía la hora del texto directamente sin conversión TZ,
-- mostrando la hora UTC en lugar de la hora Madrid (ej: 11:00 UTC aparecía como
-- hora 11 en lugar de 13 Madrid).
--
-- Usamos fn_parse_ticket_hora_cierre_ts (creada en 20260530143000) que maneja:
--   - ISO UTC: cast a timestamptz + timezone conversion
--   - Legacy hora plana (HH:MM:SS): combina con fecha como Europe/Madrid
--   - Fallback a fecha_real o medianoche de fecha

CREATE OR REPLACE FUNCTION public.get_hourly_sales(p_start_date date, p_end_date date)
RETURNS TABLE (fecha date, hora int, total numeric)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
      t.fecha::date AS fecha,
      EXTRACT(HOUR FROM timezone('Europe/Madrid',
          public.fn_parse_ticket_hora_cierre_ts(t.fecha, t.hora_cierre, t.fecha_real)
      ))::int AS hora,
      ROUND(SUM(t.total_documento)::numeric, 2) AS total
  FROM public.tickets_marbella t
  WHERE t.fecha IS NOT NULL
    AND t.fecha >= p_start_date
    AND t.fecha <= p_end_date
  GROUP BY t.fecha::date, EXTRACT(HOUR FROM timezone('Europe/Madrid',
      public.fn_parse_ticket_hora_cierre_ts(t.fecha, t.hora_cierre, t.fecha_real)
  ))
  ORDER BY t.fecha::date, hora;
$$;

GRANT EXECUTE ON FUNCTION public.get_hourly_sales(date, date) TO anon, authenticated, service_role;
