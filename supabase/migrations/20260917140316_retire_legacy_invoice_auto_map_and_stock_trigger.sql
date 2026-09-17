-- Retira la vía legacy de auto-mapeo/auto-stock. K4/K5 requieren que
-- `public.apply_receipt_line(...)` sea el único productor económico de una
-- recepción; `status = 'mapped'` solo expresa que la línea está revisada y
-- preparada para confirmación.

DROP TRIGGER IF EXISTS trigger_invoice_line_mapped_stock
  ON public.purchase_invoice_lines;

DROP FUNCTION IF EXISTS public.handle_invoice_line_mapped_stock();

DROP FUNCTION IF EXISTS public.auto_map_invoice_lines_fuzzy(uuid, numeric);
DROP FUNCTION IF EXISTS public.auto_map_invoice_lines_fuzzy(uuid, double precision);
