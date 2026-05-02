-- ==============================================================================
-- Albaranes Storage: managers pueden leer/firmar PDF de webhook y rutas legacy
--
-- Contexto:
-- - Tras `20260421195500_albaranes_allow_all_users_upload_scanner.sql`, el SELECT
--   quedó limitado a `name` bajo `${auth.uid()}/...`.
-- - El webhook `/api/webhooks/albaranes` sube con service_role a rutas tipo
--   `2026/5/<timestamp>_<archivo>.pdf` (sin prefijo de usuario).
-- - `createSignedUrl` usa el JWT del usuario → sin política que cubra esas rutas,
--   Supabase devuelve "Object not found".
--
-- Esta política OR con la de carpeta propia: gestión puede abrir cualquier objeto
-- del bucket `albaranes`; el staff sigue viendo solo su carpeta de escáner.
-- ==============================================================================

DROP POLICY IF EXISTS "albaranes_managers_select_all" ON storage.objects;
CREATE POLICY "albaranes_managers_select_all"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'albaranes'
  AND public.is_manager_or_admin()
);
