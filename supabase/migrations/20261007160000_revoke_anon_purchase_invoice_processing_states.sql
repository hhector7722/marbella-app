-- El estado de procesado de un albarán es un read model para sesiones
-- autenticadas y processos de servidor. Los visitantes anónimos no deben
-- poder consultarlo.
--
-- `REVOKE ... FROM PUBLIC` no bastaba: Supabase concede EXECUTE explícito a
-- `anon` mediante default privileges, de modo que la función seguía siendo
-- ejecutable sin sesión. Se revoca también a `anon`.
REVOKE ALL ON FUNCTION public.get_purchase_invoice_processing_states(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_invoice_processing_states(uuid[]) TO authenticated, service_role;
