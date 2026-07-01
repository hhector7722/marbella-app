-- ==============================================================================
-- PLAN DE SANEAMIENTO CRÍTICO - Bar La Marbella
-- 1. full_name en profiles
-- 2. Trigger para inyectar role en JWT (auth.users.raw_app_meta_data)
-- 3. RLS restrictivo en tablas de albaranes (solo manager/admin)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. COLUMNA GENERADA full_name EN profiles
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'full_name'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN full_name TEXT
        GENERATED ALWAYS AS (TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')))) STORED;
    END IF;
END $$;

COMMENT ON COLUMN public.profiles.full_name IS 'Nombre completo generado (first_name + last_name) para joins y display.';

-- ------------------------------------------------------------------------------
-- 2. FUNCIÓN Y TRIGGER: Inyectar role de profiles en auth.users (JWT)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_profile_role_to_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', COALESCE(NEW.role, 'staff'))
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_updated_sync_role ON public.profiles;
CREATE TRIGGER on_profile_updated_sync_role
    AFTER INSERT OR UPDATE OF role ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profile_role_to_auth();

-- Sincronizar roles existentes (one-time backfill)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id, role FROM public.profiles
    LOOP
        UPDATE auth.users
        SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', COALESCE(r.role, 'staff'))
        WHERE id = r.id;
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3. RLS RESTRICTIVO EN TABLAS DE ALBARANES (solo manager/admin)
-- ------------------------------------------------------------------------------
-- Función helper para verificar rol privilegiado
CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'admin'),
        false
    );
$$;

-- supplier_item_mappings
DROP POLICY IF EXISTS "Enable ALL for authenticated" ON public.supplier_item_mappings;
CREATE POLICY "Managers and admins only on supplier_item_mappings"
    ON public.supplier_item_mappings FOR ALL TO authenticated
    USING (public.is_manager_or_admin())
    WITH CHECK (public.is_manager_or_admin());

-- purchase_invoices
DROP POLICY IF EXISTS "Enable ALL for authenticated" ON public.purchase_invoices;
CREATE POLICY "Managers and admins only on purchase_invoices"
    ON public.purchase_invoices FOR ALL TO authenticated
    USING (public.is_manager_or_admin())
    WITH CHECK (public.is_manager_or_admin());

-- purchase_invoice_lines
DROP POLICY IF EXISTS "Enable ALL for authenticated" ON public.purchase_invoice_lines;
CREATE POLICY "Managers and admins only on purchase_invoice_lines"
    ON public.purchase_invoice_lines FOR ALL TO authenticated
    USING (public.is_manager_or_admin())
    WITH CHECK (public.is_manager_or_admin());

-- Service role mantiene acceso total (para webhooks)
-- Las políticas "Enable ALL for service_role" se mantienen si existen
