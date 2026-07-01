-- ==============================================================================
-- POLÍTICAS STORAGE PARA BUCKET NOMINAS
-- Permite a empleados leer sus propias nóminas y a managers/supervisores leer todas.
-- Sin estas políticas, usuarios staff no pueden descargar (storage deniega por defecto).
-- ==============================================================================

-- 1. Asegurar que el bucket nominas existe (privado por seguridad)
INSERT INTO storage.buckets (id, name, public)
VALUES ('nominas', 'nominas', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Política: Empleados pueden leer sus propias nóminas
--    (existe fila en employee_documents con user_id = auth.uid() y storage_path = name)
DROP POLICY IF EXISTS "nominas_staff_read_own" ON storage.objects;
CREATE POLICY "nominas_staff_read_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'nominas'
    AND EXISTS (
        SELECT 1 FROM public.employee_documents ed
        WHERE ed.storage_path = name
        AND ed.user_id = auth.uid()
        AND ed.tipo = 'nomina'
    )
);

-- 3. Política: Managers y supervisores pueden leer todas las nóminas
DROP POLICY IF EXISTS "nominas_managers_read_all" ON storage.objects;
CREATE POLICY "nominas_managers_read_all"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'nominas'
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'supervisor')
    )
);
