DROP FUNCTION IF EXISTS public.purge_failed_purchase_invoice(uuid);

CREATE OR REPLACE FUNCTION public.discard_failed_purchase_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_previous_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT p.role
  INTO v_role
  FROM public.profiles p
  WHERE p.id = v_actor;

  IF v_role NOT IN ('manager', 'admin') THEN
    RAISE EXCEPTION 'Solo manager o admin puede descartar una captura fallida'
      USING ERRCODE = '42501';
  END IF;

  SELECT pi.status
  INTO v_previous_status
  FROM public.purchase_invoices pi
  WHERE pi.id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Albarán no encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_previous_status = 'discarded' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'previous_status', v_previous_status);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_invoice_lines pil
    WHERE pil.invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Este albarán ya contiene líneas y no puede descartarse como captura fallida'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.document_extractions de
    WHERE de.invoice_id = p_invoice_id
      AND de.status = 'success'
      AND lower(de.extractor_version) LIKE 'docling%'
  ) THEN
    RAISE EXCEPTION 'Este albarán tiene una extracción Docling válida y no puede descartarse como captura fallida'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_receipt_confirmations prc
    WHERE prc.purchase_invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Este albarán ya tiene recepciones confirmadas y no puede descartarse'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ingredient_price_history iph
    WHERE iph.purchase_invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Este albarán ya tiene histórico de precio y no puede descartarse'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_interpretation_proposals pip
    WHERE pip.purchase_invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Este albarán ya tiene propuestas K5 y no puede descartarse como captura fallida'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_mapping_versions pmv
    JOIN public.document_extractions de ON de.id = pmv.source_document_extraction_id
    WHERE de.invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Este albarán ya participa en un mapeo versionado y no puede descartarse'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    JOIN public.document_extractions de ON de.id = sm.source_document_extraction_id
    WHERE de.invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Este albarán ya tiene efectos de stock y no puede descartarse'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.purchase_invoices
  SET status = 'discarded'
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'previous_status', v_previous_status,
    'status', 'discarded'
  );
END;
$$;

ALTER FUNCTION public.discard_failed_purchase_invoice(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.discard_failed_purchase_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discard_failed_purchase_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_failed_purchase_invoice(uuid) TO service_role;

COMMENT ON FUNCTION public.discard_failed_purchase_invoice(uuid) IS
  'Descarta de la operativa una captura fallida sin destruir el historial append-only de Docling; solo manager/admin y sin líneas ni efectos económicos.';
