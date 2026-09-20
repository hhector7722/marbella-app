CREATE OR REPLACE FUNCTION public.gestionar_ingredientes(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_nombre text := trim(coalesce(p_datos->>'nombre', p_datos->>'name', ''));
BEGIN
  IF p_accion NOT IN ('buscar', 'listar', 'consultar') THEN
    RETURN jsonb_build_object(
      'error', 'accion_no_soportada',
      'acciones_validas', jsonb_build_array('buscar', 'listar', 'consultar')
    );
  END IF;

  IF v_nombre <> '' THEN
    RETURN coalesce((
      SELECT jsonb_agg(to_jsonb(result) ORDER BY result.name)
      FROM (
        SELECT id, name, current_price, purchase_unit, unit_type, stock_current, allergens
        FROM public.ingredients
        WHERE name ILIKE '%' || v_nombre || '%'
        ORDER BY name
        LIMIT 10
      ) result
    ), jsonb_build_object('error', 'ingrediente_no_encontrado', 'nombre_buscado', v_nombre));
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(result) ORDER BY result.name)
    FROM (
      SELECT id, name, current_price, purchase_unit, stock_current
      FROM public.ingredients
      ORDER BY name
      LIMIT 50
    ) result
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.gestionar_ingredientes(text, jsonb) IS
  'Consulta de solo lectura del catálogo para Copiloto. No crea ni modifica ingredientes.';

REVOKE ALL ON FUNCTION public.gestionar_ingredientes(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestionar_ingredientes(text, jsonb) TO authenticated, service_role;
