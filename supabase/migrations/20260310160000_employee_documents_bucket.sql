-- ==============================================================================
-- BUCKET employee-documents: Comunicados y Contratos (subida manual por manager)
-- Las nóminas siguen en bucket 'nominas' (webhook).
-- ==============================================================================

-- 1. Crear bucket employee-documents (privado)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'employee-documents',
    'employee-documents',
    false,
    10485760,  -- 10 MB
    ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Managers pueden subir (INSERT)
DROP POLICY IF EXISTS "employee_docs_managers_insert" ON storage.objects;
CREATE POLICY "employee_docs_managers_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'employee-documents'
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('manager', 'supervisor')
    )
);

-- 3. Staff puede leer sus propios documentos (SELECT)
DROP POLICY IF EXISTS "employee_docs_staff_read_own" ON storage.objects;
CREATE POLICY "employee_docs_staff_read_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'employee-documents'
    AND (
        -- Ruta: {user_id}/comunicados/... o {user_id}/contratos/...
        (storage.foldername(name))[1] = auth.uid()::text
        OR
        -- O existe fila en employee_documents con user_id = auth.uid()
        EXISTS (
            SELECT 1 FROM public.employee_documents ed
            WHERE ed.storage_path = name
            AND ed.user_id = auth.uid()
        )
    )
);

-- 4. Managers pueden leer todos los documentos
DROP POLICY IF EXISTS "employee_docs_managers_read_all" ON storage.objects;
CREATE POLICY "employee_docs_managers_read_all"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'employee-documents'
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('manager', 'supervisor')
    )
);

-- 5. Managers pueden borrar
DROP POLICY IF EXISTS "employee_docs_managers_delete" ON storage.objects;
CREATE POLICY "employee_docs_managers_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'employee-documents'
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('manager', 'supervisor')
    )
);
