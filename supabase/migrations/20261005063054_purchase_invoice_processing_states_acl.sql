-- This read model is only for authenticated application sessions and the
-- server service role. Anonymous clients must not be able to query invoice
-- processing state through the Data API.
REVOKE ALL ON FUNCTION public.get_purchase_invoice_processing_states(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_purchase_invoice_processing_states(uuid[]) TO authenticated, service_role;
