-- La recepción K4 ya escribe sm.reference_type = 'purchase_invoice_line'
-- y sm.reference_id = pil.id, con reference_doc = 'RECEIPT:<confirmation_uuid>'.
-- La versión anterior de sync_purchase_invoice_status solo consultaba
-- 'ALB-LINE-<id>' y dejaba albaranes recibidos en pending_mapping.
-- Se aplica el mismo criterio de referencia tipada que usa el listado,
-- manteniendo el control de ingrediente y omitiendo líneas supersedidas.
CREATE OR REPLACE FUNCTION public.sync_purchase_invoice_status(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_line_count int;
  v_unresolved int;
  v_stock_missing int;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status INTO v_status
  FROM public.purchase_invoices
  WHERE id = p_invoice_id;
  IF NOT FOUND OR v_status IN ('completed', 'processing', 'ocr_failed') THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_line_count
  FROM public.purchase_invoice_lines
  WHERE invoice_id = p_invoice_id
    AND superseded_by_extraction_id IS NULL;

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
    AND pil.superseded_by_extraction_id IS NULL
    AND NOT (
      pil.status IN ('excluded', 'expense_only')
      OR (pil.mapped_ingredient_id IS NOT NULL AND COALESCE(pil.status, '') = 'mapped')
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
    AND pil.superseded_by_extraction_id IS NULL
    AND COALESCE(pil.status, '') = 'mapped'
    AND pil.mapped_ingredient_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.movement_type = 'PURCHASE'
        AND sm.ingredient_id = pil.mapped_ingredient_id
        AND (
          sm.reference_doc = 'ALB-LINE-' || pil.id::text
          OR (
            sm.reference_type = 'purchase_invoice_line'::public.stock_reference_type
            AND sm.reference_id = pil.id
          )
        )
    );

  IF v_stock_missing = 0 THEN
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
$function$;
