-- Drop old function
DROP FUNCTION IF EXISTS public.get_product_sales_ranking(p_start_date date, p_end_date date);

-- Create new function with optional time parameters
CREATE OR REPLACE FUNCTION public.get_product_sales_ranking(
  p_start_date date,
  p_end_date date,
  p_start_time text DEFAULT NULL,
  p_end_time text DEFAULT NULL
)
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
    WITH base_tickets AS (
        SELECT 
            t.numero_documento,
            (
              CASE
                WHEN t.hora_cierre IS NULL THEN NULL::time
                WHEN t.hora_cierre ~ 'T' THEN (split_part(split_part(t.hora_cierre, 'T', 2), '.', 1))::time
                WHEN t.hora_cierre ~ ' ' THEN (split_part(t.hora_cierre, ' ', 2))::time
                ELSE (substring(t.hora_cierre from 1 for 8))::time
              END
            ) AS close_time
        FROM public.tickets_marbella t
        WHERE t.fecha >= p_start_date 
          AND t.fecha <= p_end_date
    ),
    filtered_tickets AS (
        SELECT bt.numero_documento
        FROM base_tickets bt
        WHERE
          (p_start_time IS NULL OR p_end_time IS NULL)
          OR (
            bt.close_time IS NOT NULL
            AND (
              (extract(hour from bt.close_time)::int * 60 + extract(minute from bt.close_time)::int)
              BETWEEN
                (extract(hour from (substring(p_start_time from 1 for 5))::time)::int * 60 + extract(minute from (substring(p_start_time from 1 for 5))::time)::int)
                AND
                (extract(hour from (substring(p_end_time from 1 for 5))::time)::int * 60 + extract(minute from (substring(p_end_time from 1 for 5))::time)::int)
            )
          )
    )
    SELECT 
        COALESCE(a.nombre, 'Artículo Desconocido (' || tl.articulo_id || ')') as nombre_articulo,
        SUM(tl.unidades) as cantidad_total,
        CASE WHEN SUM(tl.unidades) > 0 THEN SUM(tl.importe_total) / SUM(tl.unidades) ELSE 0 END as precio_medio,
        SUM(tl.importe_total) as total_ingresos
    FROM ticket_lines_marbella tl
    INNER JOIN filtered_tickets ft ON ft.numero_documento = tl.numero_documento
    LEFT JOIN bdp_articulos a ON a.id = tl.articulo_id
    WHERE tl.fecha_negocio >= p_start_date 
      AND tl.fecha_negocio <= p_end_date
    GROUP BY a.nombre, tl.articulo_id
    ORDER BY total_ingresos DESC;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_product_sales_ranking(date, date, text, text) TO anon, authenticated, service_role;
