-- Función para obtener ventas agrupadas por hora y fecha
-- Esto reduce drásticamente los datos transferidos al cliente (de miles de tickets a 24 puntos por día)

CREATE OR REPLACE FUNCTION get_hourly_sales(p_start_date DATE, p_end_date DATE)
RETURNS TABLE (
    fecha DATE,
    hora INT,
    total NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.fecha,
        EXTRACT(HOUR FROM (t.hora_cierre::time))::INT as hora,
        ROUND(SUM(t.total_documento)::numeric, 2) as total
    FROM tickets_marbella t
    WHERE t.fecha >= p_start_date AND t.fecha <= p_end_date
    GROUP BY t.fecha, EXTRACT(HOUR FROM (t.hora_cierre::time))
    ORDER BY t.fecha, hora;
END;
$$ LANGUAGE plpgsql;

-- RLS: Asegurarse de que solo managers o perfiles autorizados puedan llamar a funciones pesadas
-- (La lógica de RLS se hereda de la tabla tickets_marbella)
