-- K2 · Cierra el circuito heredado que convertía capturar/mapear una línea
-- directamente en precio y PURCHASE. La captura y los mapeos legados quedan
-- disponibles como propuesta; solo una confirmación explícita futura podrá
-- crear hechos económicos en el ledger canónico.
--
-- No se toca ningún hecho existente ni se desactiva la lectura del escáner.
-- Las funciones siguen existiendo porque los triggers son contratos heredados,
-- pero ya no escriben ingredients, histórico de precios ni stock_movements.

CREATE OR REPLACE FUNCTION public.handle_new_invoice_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_invoice_line_mapped_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_invoice_line() IS
  'K2: la captura de línea no produce precio, historial, mapeo definitivo ni stock.';
COMMENT ON FUNCTION public.handle_invoice_line_mapped_stock() IS
  'K2: mapear una línea no produce PURCHASE; requiere confirmación económica explícita posterior.';

REVOKE ALL ON FUNCTION public.handle_new_invoice_line() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_invoice_line_mapped_stock() FROM PUBLIC, anon, authenticated;
