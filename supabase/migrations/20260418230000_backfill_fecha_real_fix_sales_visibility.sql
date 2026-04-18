-- URGENCIA: filas históricas con fecha_real NULL desaparecían de KPIs/RPCs.
-- 1) Función helper: recepción real o reconstrucción desde fecha TPV + hora_cierre.
-- 2) Backfill fecha_real en cabeceras y líneas.
-- 3) RPCs de ventas usan siempre el instante efectivo (nunca exigen solo fecha_real).

CREATE OR REPLACE FUNCTION public.ticket_effective_reception_ts(
  p_fecha date,
  p_hora_cierre text,
  p_fecha_real timestamptz
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  COALESCE(
    p_fecha_real,
    (
      (p_fecha + COALESCE(
        CASE
          WHEN p_hora_cierre IS NULL OR btrim(p_hora_cierre) = '' THEN NULL::time
          WHEN p_hora_cierre ~ 'T' THEN (NULLIF(split_part(split_part(p_hora_cierre, 'T', 2), '.', 1), ''))::time
          WHEN p_hora_cierre ~ ' ' THEN (NULLIF(split_part(p_hora_cierre, ' ', 2), ''))::time
          WHEN length(btrim(p_hora_cierre)) >= 8 THEN (substring(p_hora_cierre from 1 for 8))::time
          ELSE NULL::time
        END,
        time '12:00'
      ))::timestamp AT TIME ZONE 'Europe/Madrid'
    )
  );
$$;

COMMENT ON FUNCTION public.ticket_effective_reception_ts(date, text, timestamptz) IS
  'Instante para análisis: fecha_real del receptor si existe; si no, fecha negocio TPV + hora_cierre (o 12:00 Madrid).';

GRANT EXECUTE ON FUNCTION public.ticket_effective_reception_ts(date, text, timestamptz) TO anon, authenticated, service_role;

-- Backfill cabeceras: solo donde faltaba recepción real
UPDATE public.tickets_marbella t
SET fecha_real = public.ticket_effective_reception_ts(t.fecha, t.hora_cierre, NULL)
WHERE t.fecha_real IS NULL
  AND t.fecha IS NOT NULL;

-- Líneas: alinear con cabecera ya rellenada
UPDATE public.ticket_lines_marbella tl
SET fecha_real = t.fecha_real
FROM public.tickets_marbella t
WHERE tl.numero_documento = t.numero_documento
  AND tl.fecha_real IS NULL
  AND t.fecha_real IS NOT NULL;

-- Líneas huérfanas sin cabecera coherente: usar fecha_negocio mediodía Madrid
UPDATE public.ticket_lines_marbella tl
SET fecha_real = ((tl.fecha_negocio::timestamp + time '12:00') AT TIME ZONE 'Europe/Madrid')
WHERE tl.fecha_real IS NULL
  AND tl.fecha_negocio IS NOT NULL;

DROP FUNCTION IF EXISTS public.get_daily_sales_stats(date);
DROP FUNCTION IF EXISTS public.get_hourly_sales(date, date);
DROP FUNCTION IF EXISTS public.get_product_sales_ranking(date, date);
DROP FUNCTION IF EXISTS public.get_daily_sales_chart(integer);

CREATE OR REPLACE FUNCTION public.get_daily_sales_stats(target_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_ventas', COALESCE(SUM(t.total_documento), 0),
    'ticket_medio', CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(t.total_documento) / COUNT(*), 0) ELSE 0 END,
    'recuento_tickets', COUNT(*)
  )
  FROM public.tickets_marbella t
  WHERE (timezone('Europe/Madrid', public.ticket_effective_reception_ts(t.fecha, t.hora_cierre, t.fecha_real)))::date = target_date;
$$;

CREATE OR REPLACE FUNCTION public.get_hourly_sales(p_start_date date, p_end_date date)
RETURNS TABLE (fecha date, hora int, total numeric)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        (timezone('Europe/Madrid', public.ticket_effective_reception_ts(t.fecha, t.hora_cierre, t.fecha_real)))::date AS fecha,
        EXTRACT(HOUR FROM timezone('Europe/Madrid', public.ticket_effective_reception_ts(t.fecha, t.hora_cierre, t.fecha_real)))::int AS hora,
        ROUND(SUM(t.total_documento)::numeric, 2) AS total
    FROM public.tickets_marbella t
    WHERE (timezone('Europe/Madrid', public.ticket_effective_reception_ts(t.fecha, t.hora_cierre, t.fecha_real)))::date >= p_start_date
      AND (timezone('Europe/Madrid', public.ticket_effective_reception_ts(t.fecha, t.hora_cierre, t.fecha_real)))::date <= p_end_date
    GROUP BY 1, 2
    ORDER BY 1, 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_sales_ranking(p_start_date date, p_end_date date)
RETURNS TABLE (
  nombre_articulo text,
  cantidad_total numeric,
  precio_medio numeric,
  total_ingresos numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(a.nombre, 'Artículo Desconocido (' || tl.articulo_id || ')') AS nombre_articulo,
        SUM(tl.unidades) AS cantidad_total,
        CASE WHEN SUM(tl.unidades) > 0 THEN SUM(tl.importe_total) / SUM(tl.unidades) ELSE 0 END AS precio_medio,
        SUM(tl.importe_total) AS total_ingresos
    FROM public.ticket_lines_marbella tl
    LEFT JOIN public.bdp_articulos a ON a.id = tl.articulo_id
    LEFT JOIN public.tickets_marbella t ON t.numero_documento = tl.numero_documento
    WHERE (timezone('Europe/Madrid', COALESCE(
      tl.fecha_real,
      CASE WHEN t.numero_documento IS NOT NULL
        THEN public.ticket_effective_reception_ts(t.fecha, t.hora_cierre, t.fecha_real)
        ELSE ((tl.fecha_negocio::timestamp + time '12:00') AT TIME ZONE 'Europe/Madrid')
      END
    )))::date >= p_start_date
      AND (timezone('Europe/Madrid', COALESCE(
      tl.fecha_real,
      CASE WHEN t.numero_documento IS NOT NULL
        THEN public.ticket_effective_reception_ts(t.fecha, t.hora_cierre, t.fecha_real)
        ELSE ((tl.fecha_negocio::timestamp + time '12:00') AT TIME ZONE 'Europe/Madrid')
      END
    )))::date <= p_end_date
    GROUP BY a.nombre, tl.articulo_id
    ORDER BY total_ingresos DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_sales_chart(p_days int DEFAULT 14)
RETURNS TABLE (fecha date, total numeric)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.d::date AS fecha,
        COALESCE(SUM(t.total_documento), 0)::numeric AS total
    FROM generate_series(
        (CURRENT_DATE - (p_days - 1)),
        CURRENT_DATE,
        '1 day'::interval
    ) AS d(d)
    LEFT JOIN public.tickets_marbella t
      ON (timezone('Europe/Madrid', public.ticket_effective_reception_ts(t.fecha, t.hora_cierre, t.fecha_real)))::date = d.d::date
    GROUP BY d.d
    ORDER BY d.d;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_sales_stats(date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_hourly_sales(date, date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_sales_ranking(date, date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_sales_chart(integer) TO anon, authenticated, service_role;
