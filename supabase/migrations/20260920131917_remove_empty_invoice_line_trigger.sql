DROP TRIGGER IF EXISTS trigger_handle_new_invoice_line ON public.purchase_invoice_lines;
DROP TRIGGER IF EXISTS tr_auto_map_and_price ON public.purchase_invoice_lines;
DROP FUNCTION IF EXISTS public.handle_new_invoice_line();
