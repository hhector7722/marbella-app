-- RPC para gráfica de volumen de ventas (últimos N días)
CREATE OR REPLACE FUNCTION public.get_daily_sales_chart(p_days INT DEFAULT 14)
RETURNS TABLE (fecha DATE, total NUMERIC)
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
    LEFT JOIN tickets_marbella t ON (t.fecha)::date = d.d::date
    GROUP BY d.d
    ORDER BY d.d;
END;
$$;
