-- ==============================================================================
-- RECIPES: Vídeo de elaboración (manager-only)
-- - Columna: recipes.elaboration_video_url (URL pública)
-- - Storage: bucket recipe_videos (público lectura; escritura solo manager/admin)
-- ==============================================================================

ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS elaboration_video_url TEXT;

-- Bucket público para reproducción nativa en cliente (sin firmar URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recipe_videos',
  'recipe_videos',
  true,
  52428800,
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime'];

-- SELECT: cualquiera puede leer (bucket público)
DROP POLICY IF EXISTS "recipe_videos_public_read" ON storage.objects;
CREATE POLICY "recipe_videos_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'recipe_videos');

-- INSERT/UPDATE/DELETE: solo manager/admin (authenticated) usando helper estable
DROP POLICY IF EXISTS "recipe_videos_managers_insert" ON storage.objects;
CREATE POLICY "recipe_videos_managers_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'recipe_videos'
  AND public.is_manager_or_admin()
);

DROP POLICY IF EXISTS "recipe_videos_managers_update" ON storage.objects;
CREATE POLICY "recipe_videos_managers_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'recipe_videos'
  AND public.is_manager_or_admin()
)
WITH CHECK (
  bucket_id = 'recipe_videos'
  AND public.is_manager_or_admin()
);

DROP POLICY IF EXISTS "recipe_videos_managers_delete" ON storage.objects;
CREATE POLICY "recipe_videos_managers_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'recipe_videos'
  AND public.is_manager_or_admin()
);

