-- Escáner y «Añadir hoja»: cualquier usuario autenticado puede subir imágenes y
-- añadir líneas/adjuntos a cualquier albarán existente (no solo al que creó).
--
-- Problema previo:
-- - purchase_invoice_lines INSERT exigía pi.created_by = auth.uid() → fallo al
--   añadir hoja a un albarán escaneado por otro compañero.
-- - Storage SELECT solo bajo ${auth.uid()}/ → createSignedUrl fallaba en fotos
--   ajenas (mensaje tipo «Object not found» / permisos).

-- =============================================================================
-- 1) Líneas: INSERT para cualquier albarán existente (escáner + hoja extra)
-- =============================================================================
DROP POLICY IF EXISTS purchase_invoice_lines_insert_own ON public.purchase_invoice_lines;

DROP POLICY IF EXISTS purchase_invoice_lines_insert_authenticated ON public.purchase_invoice_lines;
CREATE POLICY purchase_invoice_lines_insert_authenticated
  ON public.purchase_invoice_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.purchase_invoices pi
      WHERE pi.id = purchase_invoice_lines.invoice_id
    )
  );

COMMENT ON POLICY purchase_invoice_lines_insert_authenticated ON public.purchase_invoice_lines IS
  'Escáner y añadir hoja: cualquier usuario autenticado puede insertar líneas OCR en albaranes existentes.';

-- =============================================================================
-- 2) Storage albaranes: lectura global authenticated (firmar URL / ver fotos)
--    La subida sigue limitada a carpeta propia (albaranes_users_insert_own).
-- =============================================================================
DROP POLICY IF EXISTS albaranes_authenticated_select_all ON storage.objects;
CREATE POLICY albaranes_authenticated_select_all
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'albaranes');
