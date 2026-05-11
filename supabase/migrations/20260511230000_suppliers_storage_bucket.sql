-- ==============================================================================
-- SUPPLIERS: bucket Storage para logos editables desde la app
-- - Bucket público (lectura) para mostrar logos sin firmar URLs.
-- - Escritura (insert/update/delete) restringida a manager/admin/supervisor.
-- - La columna suppliers.image_url se sigue actualizando desde la app con la
--   URL pública del objeto subido.
-- ==============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'suppliers',
  'suppliers',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

-- SELECT: cualquiera puede leer (bucket público)
DROP POLICY IF EXISTS "suppliers_public_read" ON storage.objects;
CREATE POLICY "suppliers_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'suppliers');

-- INSERT/UPDATE/DELETE: solo manager/admin/supervisor (authenticated)
DROP POLICY IF EXISTS "suppliers_managers_insert" ON storage.objects;
CREATE POLICY "suppliers_managers_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'suppliers'
  AND public.is_manager_or_admin()
);

DROP POLICY IF EXISTS "suppliers_managers_update" ON storage.objects;
CREATE POLICY "suppliers_managers_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'suppliers'
  AND public.is_manager_or_admin()
)
WITH CHECK (
  bucket_id = 'suppliers'
  AND public.is_manager_or_admin()
);

DROP POLICY IF EXISTS "suppliers_managers_delete" ON storage.objects;
CREATE POLICY "suppliers_managers_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'suppliers'
  AND public.is_manager_or_admin()
);
