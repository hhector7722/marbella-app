-- RLS suppliers: todos los usuarios autenticados pueden leer id, name, phone
-- para abrir la conversación de WhatsApp con el proveedor desde el flujo de pedidos

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- SELECT: todos los autenticados (lectura de teléfono para WhatsApp)
DROP POLICY IF EXISTS "Authenticated can read suppliers" ON public.suppliers;
CREATE POLICY "Authenticated can read suppliers"
    ON public.suppliers FOR SELECT TO authenticated
    USING (true);

-- INSERT/UPDATE/DELETE: solo manager/admin
DROP POLICY IF EXISTS "Managers and admins manage suppliers" ON public.suppliers;
CREATE POLICY "Managers and admins manage suppliers"
    ON public.suppliers FOR ALL TO authenticated
    USING (public.is_manager_or_admin())
    WITH CHECK (public.is_manager_or_admin());
