-- Revertir eje de ventas por horas / KPIs al TPV: columna `fecha` (día negocio) + `hora_cierre`.
-- Deja de usar `fecha_real` en RPCs (recepción servidor) para gráficas y ranking.

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
  WHERE (t.fecha)::date = target_date;
$$;

-- Misma lógica que 20260313120000_get_hourly_sales_space_datetime.sql (ISO T, espacio, HH:MM:SS plano)
CREATE OR REPLACE FUNCTION public.get_hourly_sales(p_start_date date, p_end_date date)
RETURNS TABLE (fecha date, hora int, total numeric)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        (t.fecha)::date AS fecha,
        EXTRACT(HOUR FROM (
            CASE
                WHEN t.hora_cierre ~ 'T' THEN (split_part(split_part(t.hora_cierre, 'T', 2), '.', 1))::time
                WHEN t.hora_cierre ~ ' ' THEN (split_part(t.hora_cierre, ' ', 2))::time
                ELSE (substring(t.hora_cierre from 1 for 8))::time
            END
        ))::int AS hora,
        ROUND(SUM(t.total_documento)::numeric, 2) AS total
    FROM public.tickets_marbella t
    WHERE (t.fecha)::date >= p_start_date AND (t.fecha)::date <= p_end_date
    GROUP BY (t.fecha)::date, EXTRACT(HOUR FROM (
        CASE
            WHEN t.hora_cierre ~ 'T' THEN (split_part(split_part(t.hora_cierre, 'T', 2), '.', 1))::time
            WHEN t.hora_cierre ~ ' ' THEN (split_part(t.hora_cierre, ' ', 2))::time
            ELSE (substring(t.hora_cierre from 1 for 8))::time
        END
    ))
    ORDER BY (t.fecha)::date, hora;
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
    WHERE tl.fecha_negocio >= p_start_date
      AND tl.fecha_negocio <= p_end_date
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
    LEFT JOIN public.tickets_marbella t ON (t.fecha)::date = d.d::date
    GROUP BY d.d
    ORDER BY d.d;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_sales_stats(date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_hourly_sales(date, date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_sales_ranking(date, date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_sales_chart(integer) TO anon, authenticated, service_role;
