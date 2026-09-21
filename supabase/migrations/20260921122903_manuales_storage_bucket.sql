-- Vídeos operativos y clips de fichaje servidos fuera del despliegue de Vercel.
-- La lectura pública se limita al contenido sin datos personales. No se crean
-- políticas de escritura para clientes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'manuales',
  'manuales',
  true,
  67108864,
  ARRAY['video/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 67108864,
  allowed_mime_types = ARRAY['video/mp4'];

-- `cobros.mp4` muestra un nombre completo en el TPV. Permanece privado y solo
-- una persona autenticada puede solicitar una URL firmada efímera.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'manuales-privados',
  'manuales-privados',
  false,
  67108864,
  ARRAY['video/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 67108864,
  allowed_mime_types = ARRAY['video/mp4'];

DROP POLICY IF EXISTS "manuales privados: lectura autenticada" ON storage.objects;
CREATE POLICY "manuales privados: lectura autenticada"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'manuales-privados');

-- El copiloto conserva los manuales estáticos no migrados y separa los vídeos
-- remotos para que ningún consumidor reconstruya una ruta MP4 local.
CREATE OR REPLACE FUNCTION public.consultar_manuales(p_tema text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tema', COALESCE(trim(p_tema), ''),
    'manuales',
    jsonb_build_array(
      'check-list.pdf',
      'horno-limpieza.pdf',
      'bebidas.png',
      'cambios-lluvia.png',
      'cuadro-electrico.png'
    ),
    'videos_publicos',
    jsonb_build_array(
      'horno-funcionamiento.mp4',
      'altavoces.mp4',
      'abono.mp4',
      'descuento.mp4',
      'tickets.mp4'
    ),
    'videos_privados',
    jsonb_build_array('cobros.mp4'),
    'ruta_estatica_publica',
    '/docs/manuals/',
    'ruta_videos_publica',
    'https://feqjbwxkelpgzsdiphei.supabase.co/storage/v1/object/public/manuales/operacion/',
    'ruta_videos_privada',
    '/api/manuales/video?path=operacion%2Fcobros.mp4'
  );
$$;
