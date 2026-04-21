-- ==============================================================================
-- Fix consumo personal: overload para firma double precision/varchar
--
-- Error observado en producción:
--   function public.staff_consumption_qty_to_purchase_unit(double precision, character varying, character varying) does not exist
--
-- Causa:
-- - Existe la función principal: staff_consumption_qty_to_purchase_unit(numeric, text, text)
-- - Pero el RPC process_staff_consumption (o llamadas históricas) pasan qty como double precision
--   y Postgres no resuelve la sobrecarga a numeric en ese contexto.
--
-- Solución:
-- - Crear overload con la firma exacta (double precision, varchar, varchar) y delegar.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.staff_consumption_qty_to_purchase_unit(
  p_qty double precision,
  p_recipe_unit character varying,
  p_purchase_unit character varying
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.staff_consumption_qty_to_purchase_unit(
    p_qty::numeric,
    p_recipe_unit::text,
    p_purchase_unit::text
  );
$$;

GRANT EXECUTE ON FUNCTION public.staff_consumption_qty_to_purchase_unit(double precision, character varying, character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_consumption_qty_to_purchase_unit(double precision, character varying, character varying) TO service_role;

