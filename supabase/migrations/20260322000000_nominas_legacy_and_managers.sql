-- ==============================================================================
-- NÓMINAS: Políticas para tabla legacy y managers
-- 1. Managers pueden leer tabla nominas (para ver nóminas de empleados)
-- 2. Storage: staff puede descargar archivos referenciados en tabla nominas
-- ==============================================================================

-- 1. Managers y supervisores pueden leer la tabla nominas (cualquier empleado)
-- (La política "Lectura propia nomina" ya permite a staff leer sus filas)
DROP POLICY IF EXISTS "nominas_table_managers_read" ON public.nominas;
CREATE POLICY "nominas_table_managers_read"
ON public.nominas FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'supervisor')
    )
);

-- 2. Storage: staff puede leer archivos cuando existe fila en nominas (legacy)
--    Complementa nominas_staff_read_own que solo mira employee_documents
DROP POLICY IF EXISTS "nominas_storage_from_legacy_table" ON storage.objects;
CREATE POLICY "nominas_storage_from_legacy_table"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'nominas'
    AND EXISTS (
        SELECT 1 FROM public.nominas n
        WHERE n.file_path = name
        AND n.empleado_id = auth.uid()
    )
);
