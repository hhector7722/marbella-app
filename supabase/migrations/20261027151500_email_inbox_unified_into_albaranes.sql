-- Incoming Gmail attachments appear in the existing purchase invoices list,
-- even when the sender cannot yet be associated with a verified supplier.
-- Only owner-verified sender addresses enter the automatic OCR pipeline.
CREATE OR REPLACE FUNCTION public.auto_import_purchase_email_document(p_document_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE doc public.purchase_email_documents%ROWTYPE;
  v_sender_supplier bigint; v_actor uuid; v_invoice uuid; v_job uuid;
  v_kind text; v_verified boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  SELECT * INTO doc FROM public.purchase_email_documents WHERE id=p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Email document not found'; END IF;
  IF doc.status='imported' AND doc.invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object('invoice_id',doc.invoice_id,'existing',true);
  END IF;
  IF doc.status='duplicate' OR doc.duplicate_of IS NOT NULL THEN
    RETURN jsonb_build_object('duplicate',true);
  END IF;
  IF doc.status<>'received' THEN RAISE EXCEPTION 'Unexpected inbox status';END IF;

  -- The user has supplied the precise full email addresses, never just domains.
  SELECT supplier_id INTO v_sender_supplier
  FROM public.purchase_supplier_sender_addresses
  WHERE sender_email=doc.sender_email AND confirmed_by_owner=true;
  -- All inbound PDF attachments belong to the ordinary Albaranes list.
  -- Unknown senders still get a document row, but not automatic supplier,
  -- OCR expenses or stock until a person resolves their origin.
  v_verified := v_sender_supplier IS NOT NULL
    AND doc.supplier_id IS NOT DISTINCT FROM v_sender_supplier;
  IF EXISTS(SELECT 1 FROM public.suppliers
    WHERE id=v_sender_supplier AND lower(btrim(name)) IN ('don hielo','vermut')) THEN
    v_verified := false;
  END IF;
  IF NOT v_verified THEN v_sender_supplier := NULL; END IF;
  SELECT profile_id INTO v_actor FROM private.purchase_receipt_automation_actor WHERE singleton=true;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Technical automation actor not configured'; END IF;
  IF EXISTS(SELECT 1 FROM public.purchase_invoices
    WHERE content_sha256=doc.content_sha256 AND status<>'discarded') THEN
    UPDATE public.purchase_email_documents SET status='duplicate',
      error_message='Documento ya presente en compras'
    WHERE id=doc.id;
    RETURN jsonb_build_object('duplicate',true);
  END IF;

  -- Unknown kinds are still automatically OCR'd, but cannot auto-increase stock.
  v_kind := CASE WHEN v_verified THEN NULLIF(doc.suggested_kind,'unknown') ELSE NULL END;
  INSERT INTO public.purchase_invoices (
    created_by,supplier_id,invoice_number,invoice_date,total_amount,file_path,
    status,source,content_sha256,expected_pages,document_kind
  ) VALUES (
    v_actor,v_sender_supplier,'PROCESANDO…',
    (coalesce(doc.email_date,now()) AT TIME ZONE 'Europe/Madrid')::date,
    0,doc.storage_path,CASE WHEN v_verified THEN 'processing' ELSE 'pending_mapping' END,
    'email',doc.content_sha256,1,v_kind
  ) RETURNING id INTO v_invoice;

  IF v_verified THEN
  INSERT INTO public.document_processing_jobs(
    invoice_id,storage_bucket,storage_path,file_version_hash,
    extractor_version,requested_by,replay_mode
  ) VALUES (
    v_invoice,'albaranes',doc.storage_path,doc.content_sha256,
    'mistral-ocr-4-1-document-observation-v2',v_actor,'live'
  ) ON CONFLICT (invoice_id,file_version_hash,extractor_version)
    DO UPDATE SET invoice_id=EXCLUDED.invoice_id
  RETURNING id INTO v_job;
  END IF;

  UPDATE public.purchase_email_documents
   SET status='imported',supplier_id=v_sender_supplier,
       invoice_id=v_invoice,document_kind=v_kind,error_message=NULL
   WHERE id=doc.id;
  RETURN jsonb_build_object('invoice_id',v_invoice,'job_id',v_job,
    'kind',v_kind,'automated',v_verified,'pending_review',NOT v_verified);
END;
$function$
;