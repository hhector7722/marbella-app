-- get_hourly_sales: soporta hora_cierre en ISO, HH:MM:SS y 'YYYY-MM-DD HH:MM:SS'
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
                -- ISO: 2026-03-10T14:23:00Z / 2026-03-10T14:23:00.123
                WHEN t.hora_cierre ~ 'T' THEN (split_part(split_part(t.hora_cierre, 'T', 2), '.', 1))::time
                -- Space datetime: 2026-03-10 14:23:00
                WHEN t.hora_cierre ~ ' ' THEN (split_part(t.hora_cierre, ' ', 2))::time
                -- Plain time: 14:23:00 (or longer)
                ELSE (substring(t.hora_cierre from 1 for 8))::time
            END
        ))::INT AS hora,
        ROUND(SUM(t.total_documento)::numeric, 2) AS total
    FROM tickets_marbella t
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

