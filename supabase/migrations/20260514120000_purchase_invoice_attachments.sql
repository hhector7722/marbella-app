-- Hojas adicionales del mismo albarán (multipágina): imagen extra + misma cabecera purchase_invoices.
-- La hoja 1 sigue en purchase_invoices.file_path / content_sha256; hojas 2+ aquí.

CREATE TABLE IF NOT EXISTS public.purchase_invoice_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  page_order INT NOT NULL DEFAULT 2,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT purchase_invoice_attachments_invoice_sha_unique UNIQUE (invoice_id, content_sha256)
);

CREATE INDEX IF NOT EXISTS purchase_invoice_attachments_invoice_id_idx
  ON public.purchase_invoice_attachments (invoice_id);

CREATE INDEX IF NOT EXISTS purchase_invoice_attachments_page_order_idx
  ON public.purchase_invoice_attachments (invoice_id, page_order);

COMMENT ON TABLE public.purchase_invoice_attachments IS 'Capturas adicionales (hoja 2+) vinculadas al mismo purchase_invoices; líneas se añaden a purchase_invoice_lines.';

ALTER TABLE public.purchase_invoice_attachments ENABLE ROW LEVEL SECURITY;

-- Alineado con purchase_invoices: lectura amplia authenticated.
DROP POLICY IF EXISTS purchase_invoice_attachments_select_authenticated ON public.purchase_invoice_attachments;
CREATE POLICY purchase_invoice_attachments_select_authenticated
  ON public.purchase_invoice_attachments FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS purchase_invoice_attachments_insert_authenticated ON public.purchase_invoice_attachments;
CREATE POLICY purchase_invoice_attachments_insert_authenticated
  ON public.purchase_invoice_attachments FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.purchase_invoices pi WHERE pi.id = invoice_id)
  );

DROP POLICY IF EXISTS purchase_invoice_attachments_delete_manager ON public.purchase_invoice_attachments;
CREATE POLICY purchase_invoice_attachments_delete_manager
  ON public.purchase_invoice_attachments FOR DELETE TO authenticated
  USING (public.is_manager_or_admin());
