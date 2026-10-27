-- Gmail intake, independently auditable from inventory receipts.
-- Each attachment is archived and reviewed before becoming an invoice.
ALTER TABLE public.purchase_invoices
 ADD COLUMN IF NOT EXISTS document_kind text;
ALTER TABLE public.purchase_invoices
 DROP CONSTRAINT IF EXISTS purchase_invoices_document_kind_check;
ALTER TABLE public.purchase_invoices
 ADD CONSTRAINT purchase_invoices_document_kind_check
 CHECK (document_kind IS NULL OR document_kind IN ('delivery_note','monthly_invoice','other'));

CREATE TABLE IF NOT EXISTS public.purchase_email_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 gmail_message_id text NOT NULL,
 attachment_index integer NOT NULL CHECK (attachment_index BETWEEN 0 AND 49),
 sender_email text NOT NULL,
 email_subject text NOT NULL DEFAULT '',
 email_date timestamptz,
 filename text NOT NULL,
 mime_type text NOT NULL,
 content_sha256 text NOT NULL,
 storage_path text NOT NULL,
 suggested_kind text NOT NULL DEFAULT 'unknown'
   CHECK (suggested_kind IN ('delivery_note','monthly_invoice','unknown')),
 document_kind text CHECK (document_kind IN ('delivery_note','monthly_invoice','other')),
 supplier_id bigint REFERENCES public.suppliers(id),
 invoice_id uuid REFERENCES public.purchase_invoices(id),
 duplicate_of uuid REFERENCES public.purchase_email_documents(id),
 status text NOT NULL DEFAULT 'received'
   CHECK (status IN ('received','duplicate','imported','error')),
 error_message text,
 received_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz,
 CONSTRAINT purchase_email_documents_message_attachment_key UNIQUE (gmail_message_id,attachment_index),
 CONSTRAINT purchase_email_documents_hash_valid CHECK (content_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS purchase_email_documents_received_idx
 ON public.purchase_email_documents (received_at DESC);
CREATE INDEX IF NOT EXISTS purchase_email_documents_hash_idx
 ON public.purchase_email_documents (content_sha256);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_email_documents_unique_original_hash
 ON public.purchase_email_documents (content_sha256) WHERE duplicate_of IS NULL;

ALTER TABLE public.purchase_email_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_email_documents FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.purchase_email_documents TO authenticated;
DROP POLICY IF EXISTS purchase_email_documents_manager_select ON public.purchase_email_documents;
DROP POLICY IF EXISTS purchase_email_documents_manager_update ON public.purchase_email_documents;
CREATE POLICY purchase_email_documents_manager_select ON public.purchase_email_documents
 FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL
   AND public.is_purchase_manager_or_admin());
-- Prevent direct client-side spoofing of review state: edits only through the verified RPC.
-- No UPDATE policy; RPC below runs with a server-side role gate.

CREATE OR REPLACE FUNCTION public.promote_purchase_email_document(
 p_document_id uuid, p_supplier_id bigint, p_kind text
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_doc public.purchase_email_documents%ROWTYPE;
        v_invoice uuid; v_job jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
   RAISE EXCEPTION 'Solo manager o admin puede importar albaranes por email';
 END IF;
 IF p_kind NOT IN ('delivery_note','monthly_invoice','other') THEN
   RAISE EXCEPTION 'Selecciona el tipo de documento';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p_supplier_id) THEN
   RAISE EXCEPTION 'Selecciona un proveedor válido';
 END IF;
 SELECT * INTO v_doc FROM public.purchase_email_documents
 WHERE id=p_document_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento de correo no encontrado';END IF;
 IF v_doc.status='imported' AND v_doc.invoice_id IS NOT NULL THEN
   RETURN jsonb_build_object('invoice_id',v_doc.invoice_id,'existing',true);
 END IF;
 IF v_doc.status<>'received' OR v_doc.duplicate_of IS NOT NULL THEN
   RAISE EXCEPTION 'Documento duplicado, ya importado o no disponible para revisión';
 END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_invoices i
           WHERE i.content_sha256=v_doc.content_sha256 AND i.status<>'discarded') THEN
   RAISE EXCEPTION 'El mismo documento ya existe en albaranes; no se duplicará';
 END IF;

 INSERT INTO public.purchase_invoices (
   created_by,supplier_id,invoice_number,invoice_date,total_amount,file_path,
   status,source,content_sha256,expected_pages,document_kind
 ) VALUES (
   auth.uid(),p_supplier_id,'PROCESANDO…',
   (coalesce(v_doc.email_date,now()) AT TIME ZONE 'Europe/Madrid')::date,
   0,v_doc.storage_path,'processing','email',v_doc.content_sha256,1,p_kind
 ) RETURNING id INTO v_invoice;

 v_job := public.enqueue_mistral_evidence_job(
   v_invoice,v_doc.content_sha256,v_doc.storage_path,NULL
 );
 UPDATE public.purchase_email_documents SET
   status='imported',invoice_id=v_invoice,supplier_id=p_supplier_id,
   document_kind=p_kind,reviewed_at=now(),reviewed_by=auth.uid(),
   error_message=NULL
 WHERE id=p_document_id;

 RETURN jsonb_build_object('invoice_id',v_invoice,
   'job_id',v_job->>'job_id','existing',false,'document_kind',p_kind);
END;
$fn$;
REVOKE ALL ON FUNCTION public.promote_purchase_email_document(uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.promote_purchase_email_document(uuid,bigint,text) TO authenticated;

-- A monthly summary must NEVER create a physical receipt or legacy stock entry.
-- Keep it for economic reconciliation with delivery notes.
CREATE OR REPLACE FUNCTION public.reject_monthly_invoice_stock()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $fn$
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
 IF v_line IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.purchase_invoice_lines l
   JOIN public.purchase_invoices i ON i.id=l.invoice_id
   WHERE l.id=v_line AND i.document_kind='monthly_invoice'
 ) THEN
   RAISE EXCEPTION 'Factura mensual: no genera recepción ni movimiento de stock. Conciliar con entregas.';
 END IF;
 RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS reject_monthly_invoice_purchase_movement ON public.stock_movements;
CREATE TRIGGER reject_monthly_invoice_purchase_movement BEFORE INSERT
ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.reject_monthly_invoice_stock();
DROP TRIGGER IF EXISTS reject_monthly_invoice_purchase_confirmation ON public.purchase_receipt_confirmations;
CREATE TRIGGER reject_monthly_invoice_purchase_confirmation BEFORE INSERT
ON public.purchase_receipt_confirmations FOR EACH ROW EXECUTE FUNCTION public.reject_monthly_invoice_stock();
