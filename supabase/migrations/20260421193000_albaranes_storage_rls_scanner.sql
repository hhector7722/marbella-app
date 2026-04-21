-- ==============================================================================
-- STORAGE RLS PARA BUCKET "albaranes" (escáner in-app + webhooks)
-- Motivo: el escáner sube imágenes al bucket `albaranes`. Sin policies en
-- `storage.objects`, Supabase bloquea el INSERT con:
--   "new row violates row-level security policy"
--
-- Reglas:
-- - Solo managers/admins pueden subir/leer/actualizar en `albaranes`
-- - El service_role sigue pudiendo operar (webhooks server-side)
-- ==============================================================================

-- 1) Asegurar que el bucket existe (privado)
INSERT INTO storage.buckets (id, name, public)
VALUES ('albaranes', 'albaranes', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2) Policies para managers/admins (authenticated) en storage.objects
--    Reusa helper `public.is_manager_or_admin()` (ver sanitation_critical).
DROP POLICY IF EXISTS "albaranes_managers_insert" ON storage.objects;
CREATE POLICY "albaranes_managers_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'albaranes'
  AND public.is_manager_or_admin()
);

DROP POLICY IF EXISTS "albaranes_managers_select" ON storage.objects;
CREATE POLICY "albaranes_managers_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'albaranes'
  AND public.is_manager_or_admin()
);

-- UPDATE es necesario si en el futuro se hace upsert/reemplazo.
DROP POLICY IF EXISTS "albaranes_managers_update" ON storage.objects;
CREATE POLICY "albaranes_managers_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'albaranes'
  AND public.is_manager_or_admin()
)
WITH CHECK (
  bucket_id = 'albaranes'
  AND public.is_manager_or_admin()
);

