-- Agrega TODOS los tickets y líneas del periodo dentro de PostgreSQL.
-- Una sola fila JSON evita la paginación implícita de PostgREST (1000 filas)
-- y mantiene íntegros el total, ticket medio, gráfica, horas y productos.
-- Incluye el día en curso independientemente del estado del cierre de caja.
CREATE OR REPLACE FUNCTION public.get_full_period_ticket_sales_detail(
    p_start_date date,
    p_end_date date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH tickets AS (
    SELECT
        t.total_documento,
        EXTRACT(
            HOUR FROM timezone(
                'Europe/Madrid',
                public.fn_parse_ticket_hora_cierre_ts(
                    t.fecha, t.hora_cierre, t.fecha_real
                )
            )
        )::int AS hour
    FROM public.tickets_marbella t
    WHERE t.fecha >= p_start_date AND t.fecha <= p_end_date
),
totals AS (
    SELECT
        COUNT(*)::bigint AS ticket_count,
        COALESCE(SUM(total_documento), 0)::numeric AS total_sales
    FROM tickets
),
hours AS (
    SELECT hour, COUNT(*)::bigint AS ticket_count,
           COALESCE(SUM(total_documento), 0)::numeric AS total_sales
    FROM tickets
    WHERE hour BETWEEN 0 AND 23
    GROUP BY hour
),
products AS (
    SELECT
        COALESCE(NULLIF(btrim(a.nombre), ''), NULLIF(btrim(tl.nombre), ''),
                 'Artículo desconocido (' || tl.articulo_id::text || ')') AS nombre_articulo,
        SUM(tl.unidades)::numeric AS cantidad_total,
        CASE WHEN SUM(tl.unidades) > 0
             THEN SUM(tl.importe_total) / SUM(tl.unidades)
             ELSE 0 END::numeric AS precio_medio,
        COALESCE(SUM(tl.importe_total), 0)::numeric AS total_ingresos
    FROM public.ticket_lines_marbella tl
    LEFT JOIN public.bdp_articulos a ON a.id = tl.articulo_id
    WHERE tl.fecha_negocio >= p_start_date
      AND tl.fecha_negocio <= p_end_date
    GROUP BY tl.articulo_id,
             COALESCE(NULLIF(btrim(a.nombre), ''), NULLIF(btrim(tl.nombre), ''),
                      'Artículo desconocido (' || tl.articulo_id::text || ')')
)
SELECT jsonb_build_object(
    'summary', jsonb_build_object(
        'totalSales', (SELECT total_sales FROM totals),
        'count', (SELECT ticket_count FROM totals),
        'avgTicket', (
            SELECT CASE WHEN ticket_count > 0
                THEN total_sales / ticket_count ELSE 0 END FROM totals
        )
    ),
    'hours', COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object('hour', hour, 'count', ticket_count, 'total', total_sales)
            ORDER BY hour
        ) FROM hours
    ), '[]'::jsonb),
    'products', COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'nombre_articulo', nombre_articulo,
                'cantidad_total', cantidad_total,
                'precio_medio', precio_medio,
                'total_ingresos', total_ingresos
            )
            ORDER BY total_ingresos DESC, nombre_articulo
        ) FROM products
    ), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.get_full_period_ticket_sales_detail(date, date)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_full_period_ticket_sales_detail(date, date)
    TO authenticated;

COMMENT ON FUNCTION public.get_full_period_ticket_sales_detail(date, date) IS
    'Resumen completo de tickets y líneas del periodo. Sin límites de filas '
    'para ventas, medias, gráfica, horas o productos. Incluye ventas del día '
    'en curso sin cierre. Se ejecuta con permisos y RLS del usuario.';
