CREATE OR REPLACE FUNCTION public.purge_failed_purchase_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_file_path text;
  v_extractions integer := 0;
  v_jobs integer := 0;
  v_attachments integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT p.role
  INTO v_role
  FROM public.profiles p
  WHERE p.id = v_actor;

  IF v_role NOT IN ('manager', 'admin') THEN
    RAISE EXCEPTION 'Solo manager o admin puede eliminar una captura fallida'
      USING ERRCODE = '42501';
  END IF;

  SELECT pi.file_path
  INTO v_file_path
  FROM public.purchase_invoices pi
  WHERE pi.id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Albarán no encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_invoice_lines pil
    WHERE pil.invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Este albarán ya contiene líneas y no puede eliminarse como captura fallida'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.document_extractions de
    WHERE de.invoice_id = p_invoice_id
      AND de.status = 'success'
      AND lower(de.extractor_version) LIKE 'docling%'
  ) THEN
    RAISE EXCEPTION 'Este albarán tiene una extracción Docling válida y no puede eliminarse como captura fallida'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_receipt_confirmations prc
    WHERE prc.purchase_invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Este albarán ya tiene recepciones confirmadas y no puede eliminarse'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ingredient_price_history iph
    WHERE iph.purchase_invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Este albarán ya tiene histórico de precio y no puede eliminarse'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_interpretation_proposals pip
    WHERE pip.purchase_invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Este albarán ya tiene propuestas K5 y no puede eliminarse como captura fallida'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_mapping_versions pmv
    JOIN public.document_extractions de ON de.id = pmv.source_document_extraction_id
    WHERE de.invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Este albarán ya participa en un mapeo versionado y no puede eliminarse'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    JOIN public.document_extractions de ON de.id = sm.source_document_extraction_id
    WHERE de.invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Este albarán ya tiene efectos de stock y no puede eliminarse'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer
  INTO v_extractions
  FROM public.document_extractions de
  WHERE de.invoice_id = p_invoice_id;

  SELECT count(*)::integer
  INTO v_jobs
  FROM public.document_processing_jobs j
  WHERE j.invoice_id = p_invoice_id;

  SELECT count(*)::integer
  INTO v_attachments
  FROM public.purchase_invoice_attachments a
  WHERE a.invoice_id = p_invoice_id;

  DELETE FROM public.document_processing_job_events e
  USING public.document_processing_jobs j
  WHERE e.job_id = j.id
    AND j.invoice_id = p_invoice_id;

  DELETE FROM public.document_processing_jobs j
  WHERE j.invoice_id = p_invoice_id;

  DELETE FROM public.document_cells dc
  USING public.document_tables dt, public.document_extractions de
  WHERE dc.table_id = dt.id
    AND dt.extraction_id = de.id
    AND de.invoice_id = p_invoice_id;

  DELETE FROM public.document_rows dr
  USING public.document_tables dt, public.document_extractions de
  WHERE dr.table_id = dt.id
    AND dt.extraction_id = de.id
    AND de.invoice_id = p_invoice_id;

  DELETE FROM public.document_columns dc
  USING public.document_tables dt, public.document_extractions de
  WHERE dc.table_id = dt.id
    AND dt.extraction_id = de.id
    AND de.invoice_id = p_invoice_id;

  DELETE FROM public.document_tables dt
  USING public.document_extractions de
  WHERE dt.extraction_id = de.id
    AND de.invoice_id = p_invoice_id;

  DELETE FROM public.document_extractions de
  WHERE de.invoice_id = p_invoice_id;

  DELETE FROM public.purchase_invoice_attachments a
  WHERE a.invoice_id = p_invoice_id;

  DELETE FROM public.purchase_invoices pi
  WHERE pi.id = p_invoice_id;

  RETURN jsonb_build_object(
    'ok', true,
    'file_path', v_file_path,
    'deleted_lines', 0,
    'deleted_extractions', v_extractions,
    'deleted_jobs', v_jobs,
    'deleted_attachments', v_attachments
  );
END;
$$;

ALTER FUNCTION public.purge_failed_purchase_invoice(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.purge_failed_purchase_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_failed_purchase_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_failed_purchase_invoice(uuid) TO service_role;

COMMENT ON FUNCTION public.purge_failed_purchase_invoice(uuid) IS
  'Purga física y transaccional de una captura de albarán fallida: solo manager/admin, sin líneas, sin Docling success y sin efectos económicos.';
