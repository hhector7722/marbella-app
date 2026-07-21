-- OCR albaranes en segundo plano: estados processing / ocr_failed + mensaje de error.
-- La imagen se guarda al instante; Gemini rellena líneas después.

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS ocr_error TEXT;

COMMENT ON COLUMN public.purchase_invoices.ocr_error IS
  'Mensaje legible de fallo OCR (Gemini). Relevante cuando status = ocr_failed.';

ALTER TABLE public.purchase_invoice_attachments
  ADD COLUMN IF NOT EXISTS ocr_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE public.purchase_invoice_attachments
  ADD COLUMN IF NOT EXISTS ocr_error TEXT;

COMMENT ON COLUMN public.purchase_invoice_attachments.ocr_status IS
  'pending | done | failed — OCR de hoja adicional en segundo plano.';

COMMENT ON COLUMN public.purchase_invoice_attachments.ocr_error IS
  'Mensaje de fallo OCR de la hoja adicional.';

-- Permitir actualizar ocr_status/ocr_error de adjuntos propios (o managers).
DROP POLICY IF EXISTS purchase_invoice_attachments_update_own_or_manager ON public.purchase_invoice_attachments;
CREATE POLICY purchase_invoice_attachments_update_own_or_manager
  ON public.purchase_invoice_attachments FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_manager_or_admin()
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.is_manager_or_admin()
  );

-- sync: no pisar processing / ocr_failed (igual que completed).
CREATE OR REPLACE FUNCTION public.sync_purchase_invoice_status(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_line_count int;
  v_unresolved int;
  v_stock_missing int;
  v_fully_processed boolean;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status INTO v_status
  FROM public.purchase_invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Estados terminales / en vuelo OCR: no tocar
  IF v_status IN ('completed', 'processing', 'ocr_failed') THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_line_count
  FROM public.purchase_invoice_lines
  WHERE invoice_id = p_invoice_id;

  IF v_line_count = 0 THEN
    IF v_status = 'mapped' THEN
      UPDATE public.purchase_invoices
      SET status = 'pending_mapping'
      WHERE id = p_invoice_id;
    END IF;
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_unresolved
  FROM public.purchase_invoice_lines pil
  WHERE pil.invoice_id = p_invoice_id
    AND NOT (
      pil.status IN ('excluded', 'expense_only')
      OR (
        pil.mapped_ingredient_id IS NOT NULL
        AND COALESCE(pil.status, '') = 'mapped'
      )
    );

  IF v_unresolved > 0 THEN
    IF v_status = 'mapped' THEN
      UPDATE public.purchase_invoices
      SET status = 'pending_mapping'
      WHERE id = p_invoice_id;
    END IF;
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_stock_missing
  FROM public.purchase_invoice_lines pil
  WHERE pil.invoice_id = p_invoice_id
    AND COALESCE(pil.status, '') = 'mapped'
    AND pil.mapped_ingredient_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.movement_type = 'PURCHASE'
        AND sm.ingredient_id = pil.mapped_ingredient_id
        AND sm.reference_doc = 'ALB-LINE-' || pil.id::text
    );

  v_fully_processed := v_stock_missing = 0;

  IF v_fully_processed THEN
    IF v_status IS DISTINCT FROM 'mapped' THEN
      UPDATE public.purchase_invoices
      SET status = 'mapped'
      WHERE id = p_invoice_id;
    END IF;
  ELSIF v_status = 'mapped' THEN
    UPDATE public.purchase_invoices
    SET status = 'pending_mapping'
    WHERE id = p_invoice_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.sync_purchase_invoice_status(uuid) IS
  'Alinea purchase_invoices.status con líneas resueltas (mapped|excluded|expense_only) y stock PURCHASE ALB-LINE-*; respeta completed/processing/ocr_failed.';

GRANT EXECUTE ON FUNCTION public.sync_purchase_invoice_status(uuid) TO authenticated, service_role;
