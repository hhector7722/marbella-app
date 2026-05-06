-- ==============================================================================
-- CARTA: imágenes override por artículo (digital_menu_overrides.override_photo_url)
-- - Storage: bucket carta_items (público lectura; escritura solo manager/admin/supervisor)
-- ==============================================================================

-- Bucket público para poder mostrar imágenes en /carta sin firmar URLs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'carta_items',
  'carta_items',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- SELECT: cualquiera puede leer (bucket público)
DROP POLICY IF EXISTS "carta_items_public_read" ON storage.objects;
CREATE POLICY "carta_items_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'carta_items');

-- INSERT/UPDATE/DELETE: solo manager/admin/supervisor (authenticated)
DROP POLICY IF EXISTS "carta_items_managers_insert" ON storage.objects;
CREATE POLICY "carta_items_managers_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'carta_items'
  AND public.is_manager_or_admin()
);

DROP POLICY IF EXISTS "carta_items_managers_update" ON storage.objects;
CREATE POLICY "carta_items_managers_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'carta_items'
  AND public.is_manager_or_admin()
)
WITH CHECK (
  bucket_id = 'carta_items'
  AND public.is_manager_or_admin()
);

DROP POLICY IF EXISTS "carta_items_managers_delete" ON storage.objects;
CREATE POLICY "carta_items_managers_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'carta_items'
  AND public.is_manager_or_admin()
);

