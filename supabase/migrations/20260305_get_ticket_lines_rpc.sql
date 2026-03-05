-- Create RPC for ticket lines drill-down
CREATE OR REPLACE FUNCTION get_ticket_lines(p_numero_documento TEXT)
RETURNS TABLE (
    cantidad NUMERIC,
    articulo_nombre TEXT,
    precio_unidad NUMERIC,
    importe_total NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tl.unidades,
        COALESCE(a.nombre, 'Producto Desconocido'),
        tl.precio_unidad,
        tl.importe_total
    FROM ticket_lines_marbella tl
    LEFT JOIN bdp_articulos a ON tl.articulo_id = a.id
    WHERE tl.numero_documento = p_numero_documento
    ORDER BY tl.linea;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
