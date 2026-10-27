-- Secure automatic email onboarding. A verified sender may initiate evidence
-- processing; only a genuine delivery note can later enter the K5 stock path.
CREATE OR REPLACE FUNCTION public.auto_import_purchase_email_document(p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE doc public.purchase_email_documents%ROWTYPE;
  v_sender_supplier bigint; v_actor uuid; v_invoice uuid; v_job uuid;
  v_kind text;
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
  IF v_sender_supplier IS NULL OR doc.supplier_id IS DISTINCT FROM v_sender_supplier THEN
    RETURN jsonb_build_object('pending_review',true,'reason','sender_not_verified');
  END IF;
  -- Exclude suppliers managed through the dedicated physical intake form.
  IF EXISTS(SELECT 1 FROM public.suppliers
    WHERE id=v_sender_supplier AND lower(btrim(name)) IN ('don hielo','vermut')) THEN
    RETURN jsonb_build_object('pending_review',true,'reason','manual_supplier');
  END IF;
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
  v_kind := NULLIF(doc.suggested_kind,'unknown');
  INSERT INTO public.purchase_invoices (
    created_by,supplier_id,invoice_number,invoice_date,total_amount,file_path,
    status,source,content_sha256,expected_pages,document_kind
  ) VALUES (
    v_actor,v_sender_supplier,'PROCESANDO…',
    (coalesce(doc.email_date,now()) AT TIME ZONE 'Europe/Madrid')::date,
    0,doc.storage_path,'processing','email',doc.content_sha256,1,v_kind
  ) RETURNING id INTO v_invoice;

  INSERT INTO public.document_processing_jobs(
    invoice_id,storage_bucket,storage_path,file_version_hash,
    extractor_version,requested_by,replay_mode
  ) VALUES (
    v_invoice,'albaranes',doc.storage_path,doc.content_sha256,
    'mistral-ocr-4-1-document-observation-v2',v_actor,'live'
  ) ON CONFLICT (invoice_id,file_version_hash,extractor_version)
    DO UPDATE SET invoice_id=EXCLUDED.invoice_id
  RETURNING id INTO v_job;

  UPDATE public.purchase_email_documents
   SET status='imported',supplier_id=v_sender_supplier,
       invoice_id=v_invoice,document_kind=v_kind,error_message=NULL
   WHERE id=doc.id;
  RETURN jsonb_build_object('invoice_id',v_invoice,'job_id',v_job,
    'kind',v_kind,'automated',true);
END;
$$;
REVOKE ALL ON FUNCTION public.auto_import_purchase_email_document(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.auto_import_purchase_email_document(uuid) TO service_role;

-- Stock guard is enforced for EVERY workflow: scanner, Gmail, manual K4,
-- job processor. Supplier Otros always affects expenses, never inventory.
CREATE OR REPLACE FUNCTION public.reject_monthly_invoice_stock()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE v_line uuid;
BEGIN
 IF TG_TABLE_NAME='stock_movements' THEN
   IF NEW.movement_type <> 'PURCHASE' THEN RETURN NEW; END IF;
   IF NEW.reference_type='purchase_invoice_line'::public.stock_reference_type THEN
     v_line := NEW.reference_id;
   ELSIF coalesce(NEW.reference_doc,'') ~*
      '^ALB-LINE-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
     v_line := substring(NEW.reference_doc from 10)::uuid;
   END IF;
 ELSIF TG_TABLE_NAME='purchase_receipt_confirmations' THEN
   v_line := NEW.purchase_invoice_line_id;
 END IF;
 IF v_line IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.purchase_invoice_lines l
   JOIN public.purchase_invoices i ON i.id=l.invoice_id
   LEFT JOIN public.suppliers s ON s.id=i.supplier_id
   WHERE l.id=v_line AND (
     i.document_kind IN ('monthly_invoice','other')
     OR lower(btrim(s.name)) IN ('don hielo','vermut','otros')
     OR (i.source='email' AND i.document_kind IS DISTINCT FROM 'delivery_note')
   )
 ) THEN
   RAISE EXCEPTION 'Gasto, factura mensual o documento no validado: no puede generar stock';
 END IF;
 RETURN NEW;
END;
$fn$;

-- Even a previously received invoice must not be casually assigned to Otros,
-- as that would misrepresent historical purchase stock.
CREATE OR REPLACE FUNCTION public.guard_otros_supplier_reassignment()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $guard$
BEGIN
 IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id AND
    EXISTS(SELECT 1 FROM public.suppliers WHERE id=NEW.supplier_id AND lower(btrim(name))='otros')
    AND EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations WHERE purchase_invoice_id=OLD.id) THEN
   RAISE EXCEPTION 'Recepción de stock ya existente: antes de asignar Otros debe conciliar los movimientos';
 END IF;
 RETURN NEW;
END;
$guard$;
DROP TRIGGER IF EXISTS guard_otros_supplier_reassignment ON public.purchase_invoices;
CREATE TRIGGER guard_otros_supplier_reassignment
BEFORE UPDATE OF supplier_id ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_otros_supplier_reassignment();
