-- Albaranes escáner/email: deduplicación por hash del fichero y vínculo a duplicado semántico.

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS content_sha256 TEXT;

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS duplicate_of_invoice_id UUID REFERENCES public.purchase_invoices(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.purchase_invoices.content_sha256 IS 'SHA-256 del binario (imagen/PDF) para detectar la misma captura subida dos veces.';
COMMENT ON COLUMN public.purchase_invoices.duplicate_of_invoice_id IS 'Si se registró como duplicado lógico, apunta al albarán original.';

-- Una misma imagen exacta no puede registrarse dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_invoices_content_sha256_uidx
  ON public.purchase_invoices (content_sha256)
  WHERE content_sha256 IS NOT NULL;
