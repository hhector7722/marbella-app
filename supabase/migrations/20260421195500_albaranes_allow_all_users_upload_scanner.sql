-- ==============================================================================
-- Escáner albaranes: permitir subida para cualquier usuario autenticado
--
-- Objetivo:
-- - Cualquier usuario (authenticated) puede subir imágenes al bucket `albaranes`
-- - Aislamiento por carpeta: `name` debe empezar por `${auth.uid()}/...`
-- - Lectura/actualización: solo de sus propios ficheros (mismo prefijo)
--
-- Nota:
-- - Mantiene bucket como privado (public=false)
-- ==============================================================================

-- 1) Asegurar bucket `albaranes` existe (privado)
INSERT INTO storage.buckets (id, name, public)
VALUES ('albaranes', 'albaranes', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2) Policies "user-scoped" por prefijo auth.uid()
--    IMPORTANTE: storage.foldername(name) devuelve array de segmentos de ruta.
--    Exigimos que el primer segmento sea auth.uid() (carpeta por usuario).

DROP POLICY IF EXISTS "albaranes_users_insert_own" ON storage.objects;
CREATE POLICY "albaranes_users_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'albaranes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "albaranes_users_select_own" ON storage.objects;
CREATE POLICY "albaranes_users_select_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'albaranes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "albaranes_users_update_own" ON storage.objects;
CREATE POLICY "albaranes_users_update_own"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'albaranes'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'albaranes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

