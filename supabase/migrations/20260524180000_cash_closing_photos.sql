-- Fotos adjuntas en cierres de caja: totales datáfonos + ticket cierre BDP

ALTER TABLE public.cash_closings
  ADD COLUMN IF NOT EXISTS dataphone_totals_photo_path TEXT,
  ADD COLUMN IF NOT EXISTS bdp_closing_ticket_photo_path TEXT;

COMMENT ON COLUMN public.cash_closings.dataphone_totals_photo_path IS
  'Ruta en Storage (bucket cash_closings) de la foto de totales de datáfonos.';

COMMENT ON COLUMN public.cash_closings.bdp_closing_ticket_photo_path IS
  'Ruta en Storage (bucket cash_closings) del ticket de cierre emitido por BDP.';

-- Bucket privado para documentación de cierres
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cash_closings',
  'cash_closings',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

DROP POLICY IF EXISTS "cash_closings_authenticated_select" ON storage.objects;
CREATE POLICY "cash_closings_authenticated_select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'cash_closings');

DROP POLICY IF EXISTS "cash_closings_authenticated_insert" ON storage.objects;
CREATE POLICY "cash_closings_authenticated_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'cash_closings');

DROP POLICY IF EXISTS "cash_closings_authenticated_update" ON storage.objects;
CREATE POLICY "cash_closings_authenticated_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'cash_closings')
WITH CHECK (bucket_id = 'cash_closings');

DROP POLICY IF EXISTS "cash_closings_authenticated_delete" ON storage.objects;
CREATE POLICY "cash_closings_authenticated_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'cash_closings');
