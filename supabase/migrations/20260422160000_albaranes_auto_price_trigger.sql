-- Albaranes: auto-sincronizar precio al recibir líneas
-- Activa el trigger que ejecuta `public.handle_new_invoice_line()` al insertar en `purchase_invoice_lines`.
-- Nota: La función ya existe (ver migración 20260326100000_recipes_financials_cleanup_and_price_fix.sql).

DO $$
BEGIN
  -- Drop defensivo para evitar duplicados si ya existía con otro nombre
  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'trigger_handle_new_invoice_line'
      AND n.nspname = 'public'
      AND c.relname = 'purchase_invoice_lines'
  ) THEN
    EXECUTE 'DROP TRIGGER trigger_handle_new_invoice_line ON public.purchase_invoice_lines';
  END IF;
END $$;

CREATE TRIGGER trigger_handle_new_invoice_line
AFTER INSERT ON public.purchase_invoice_lines
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_invoice_line();

