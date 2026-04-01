-- ==============================================================================
-- NÓMINAS: Permisos de Escritura para Managers
-- Permite a managers/supervisores Subir (Insert), Modificar (Update) y Borrar (Delete)
-- tanto en el bucket de storage como en las tablas de base de datos asociadas.
-- ==============================================================================

-- 1. STORAGE: Políticas para el bucket 'nominas'
-- INSERT: Permitir a managers subir nuevos archivos
DROP POLICY IF EXISTS "nominas_managers_insert" ON storage.objects;
CREATE POLICY "nominas_managers_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'nominas'
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'manager'
    )
);

-- UPDATE: Permitir a managers modificar archivos existentes
DROP POLICY IF EXISTS "nominas_managers_update" ON storage.objects;
CREATE POLICY "nominas_managers_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'nominas'
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'manager'
    )
);

-- DELETE: Permitir a managers borrar archivos
DROP POLICY IF EXISTS "nominas_managers_delete" ON storage.objects;
CREATE POLICY "nominas_managers_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'nominas'
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'manager'
    )
);

-- 2. TABLAS DE BASE DE DATOS: Permisos para managers

-- Tabla public.nominas (unificar SELECT/INSERT/UPDATE/DELETE en FOR ALL)
DROP POLICY IF EXISTS "nominas_table_managers_read" ON public.nominas;
DROP POLICY IF EXISTS "nominas_table_managers_all" ON public.nominas;
CREATE POLICY "nominas_table_managers_all"
ON public.nominas FOR ALL 
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'manager'
    )
);

-- Tabla public.employee_documents (unificar SELECT/INSERT/UPDATE/DELETE en FOR ALL)
DROP POLICY IF EXISTS "employee_docs_managers_read_all" ON public.employee_documents;
DROP POLICY IF EXISTS "employee_docs_table_managers_all" ON public.employee_documents;
CREATE POLICY "employee_docs_table_managers_all"
ON public.employee_documents FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'manager'
    )
);
