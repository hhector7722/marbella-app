-- RPC get_hourly_sales: maneja fecha (date/timestamp) y hora_cierre (HH:MM:SS o ISO)
CREATE OR REPLACE FUNCTION public.get_hourly_sales(p_start_date DATE, p_end_date DATE)
RETURNS TABLE (fecha DATE, hora INT, total NUMERIC)
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
                ELSE (substring(t.hora_cierre from 1 for 8))::time
            END
        ))::INT AS hora,
        ROUND(SUM(t.total_documento)::numeric, 2) AS total
    FROM tickets_marbella t
    WHERE (t.fecha)::date >= p_start_date AND (t.fecha)::date <= p_end_date
    GROUP BY (t.fecha)::date, EXTRACT(HOUR FROM (
        CASE 
            WHEN t.hora_cierre ~ 'T' THEN (split_part(split_part(t.hora_cierre, 'T', 2), '.', 1))::time
            ELSE (substring(t.hora_cierre from 1 for 8))::time
        END
    ))
    ORDER BY (t.fecha)::date, hora;
END;
$$;
