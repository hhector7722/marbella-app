-- Adjunto multimedia privado para mensajes que se entregan al fichar.
-- La política de lectura de staff_clock_messages sigue siendo la autoridad:
-- el destinatario no ve el archivo hasta fichar tras la creación del mensaje.
ALTER TABLE public.staff_clock_messages
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.staff_clock_messages
  ADD CONSTRAINT staff_clock_messages_attachments_valid
  CHECK (jsonb_typeof(attachments) = 'array' AND jsonb_array_length(attachments) <= 8);

ALTER TABLE public.staff_clock_messages
  DROP CONSTRAINT IF EXISTS staff_clock_messages_body_check;
ALTER TABLE public.staff_clock_messages
  ADD CONSTRAINT staff_clock_messages_body_or_attachment_check
  CHECK (char_length(btrim(body)) <= 2000 AND
    (char_length(btrim(body)) > 0 OR jsonb_array_length(attachments) > 0));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-clock-media', 'staff-clock-media', false, 52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/mp3', 'audio/wav',
    'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/aac',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]::text[]
) ON CONFLICT (id) DO NOTHING;

-- Solo la cuenta propietaria puede subir archivos a su propio directorio.
CREATE POLICY staff_clock_media_owner_upload ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'staff-clock-media'
  AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  AND lower(coalesce((SELECT auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com'
  AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]+$'
);

-- Los mensajes son privados; su RLS permite leer al emisor y al receptor
-- únicamente después de un fichaje real posterior al envío.
-- También permite al remitente ver archivos subidos que todavía no ha enviado.
CREATE POLICY staff_clock_media_authorized_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'staff-clock-media'
  AND (
    (
      split_part(name, '/', 1) = (SELECT auth.uid())::text
      AND lower(coalesce((SELECT auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com'
    )
    OR EXISTS (
      SELECT 1
      FROM public.staff_clock_messages AS scm
      WHERE scm.attachments @> jsonb_build_array(jsonb_build_object('path', storage.objects.name))
    )
  )
);

-- Se eliminan únicamente los archivos propios tras un envío fallido.
CREATE POLICY staff_clock_media_owner_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'staff-clock-media'
  AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  AND lower(coalesce((SELECT auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com'
);
