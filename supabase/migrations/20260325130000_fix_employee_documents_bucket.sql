-- ==============================================================================
-- FIX: Bucket employee-documents - asegurar que existe y políticas correctas
-- Si el bucket no existe, crearlo. Relajar MIME types para evitar rechazos.
-- ==============================================================================

-- 1. Crear bucket si no existe (mínimo de columnas para compatibilidad)
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Actualizar límites si la columna existe (algunas instancias no la tienen)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit'
    ) THEN
        UPDATE storage.buckets SET file_size_limit = 10485760 WHERE id = 'employee-documents';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types'
    ) THEN
        -- Permitir PDF, Office, imágenes. NULL = permitir todos.
        UPDATE storage.buckets SET allowed_mime_types = NULL WHERE id = 'employee-documents';
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignorar si las columnas no existen
END $$;

-- 3. Política INSERT: managers pueden subir a cualquier ruta
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

