-- Owner-directed removal from operational albaran list of ONE manual
-- recent scanner capture without physical/economic effects.
-- Append-only source and K5 evidence remain for audit; status 'discarded'
-- is excluded from the app's historical list.
--
-- Videla scanner of 10-Nov is NOT eligible: two actual PURCHASE receipts
-- and price history must remain; this migration never references it.
CREATE TABLE IF NOT EXISTS private.purchase_owner_retired_manual_scans (
 invoice_id uuid PRIMARY KEY REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
 source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
 source_file_path text NOT NULL,
 source_created_at timestamptz NOT NULL,
 source_invoice_date date NOT NULL,
 source_supplier_id bigint NOT NULL,
 retired_at timestamptz NOT NULL DEFAULT now(),
 original_status text NOT NULL CHECK(original_status='pending_mapping'),
 final_status text NOT NULL CHECK(final_status='discarded'),
 source_lines_retained int NOT NULL CHECK(source_lines_retained=3),
 receipts_at_retirement int NOT NULL CHECK(receipts_at_retirement=0),
 stock_movements_at_retirement int NOT NULL CHECK(stock_movements_at_retirement=0),
 price_updates_at_retirement int NOT NULL CHECK(price_updates_at_retirement=0),
 source_original_retained boolean NOT NULL DEFAULT true CHECK(source_original_retained),
 reason text NOT NULL DEFAULT 'Owner 2026-11-10: retire recent manually uploaded Hielo Fenix scanner from operational history, no physical stock'
);
ALTER TABLE private.purchase_owner_retired_manual_scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_owner_retired_manual_scans FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_owner_retired_manual_scans TO service_role;

DO $retire$
DECLARE
 v public.purchase_invoices%ROWTYPE;
 v_count int;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('owner-retire-nov7-hielo-manual-capture',0));
 SELECT * INTO v FROM public.purchase_invoices
 WHERE id='95bc77f0-46c0-4594-8161-a3443ee2af95'::uuid FOR UPDATE;
 IF v.id IS NULL OR v.source<>'scanner'
  OR v.status<>'pending_mapping' OR v.invoice_number<>'PROCESANDO…'
  OR v.created_at NOT BETWEEN '2026-11-07 19:00+00'::timestamptz
    AND '2026-11-07 19:30+00'::timestamptz
  OR v.invoice_date<>'2026-11-07'::date
  OR v.supplier_id<>13 OR v.total_amount<>23.00
  OR v.content_sha256<>'fa0b3f121c45d543c427e91d4bcffbd5627d8aa0007e5da864ed2b02c1e20608'
  OR v.file_path<>'c5aed5dd-aa3c-4c21-8eaf-4393ca118dc4/2026/11/1794078516120_scanner_image.jpg'
  OR v.duplicate_of_invoice_id IS NOT NULL
 THEN RAISE EXCEPTION 'Hielo November 7 capture changed: refuse retirement'; END IF;

 SELECT count(*) INTO v_count FROM public.purchase_invoice_lines
 WHERE invoice_id=v.id AND superseded_by_extraction_id IS NULL;
 IF v_count<>3 THEN RAISE EXCEPTION 'Hielo capture has unexpected line count %',v_count; END IF;

 IF EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r
     WHERE r.purchase_invoice_id=v.id)
 OR EXISTS(SELECT 1 FROM public.stock_movements sm
     JOIN public.purchase_invoice_lines l ON l.id=sm.reference_id
     WHERE l.invoice_id=v.id)
 OR EXISTS(SELECT 1 FROM public.ingredient_price_history ph
     WHERE ph.purchase_invoice_id=v.id)
 OR EXISTS(SELECT 1 FROM public.manual_ice_receipts rc
     WHERE rc.invoice_id=v.id)
 OR EXISTS(SELECT 1 FROM public.otros_expense_backfill_audit o
     WHERE o.invoice_id=v.id)
 OR EXISTS(SELECT 1 FROM stock_v2.purchase_line_audit a
     WHERE a.invoice_id=v.id)
 OR EXISTS(SELECT 1 FROM public.purchase_mapping_versions m
   JOIN public.document_extractions e ON e.id=m.source_document_extraction_id
   WHERE e.invoice_id=v.id)
 OR EXISTS(SELECT 1 FROM public.document_processing_jobs j
   WHERE j.invoice_id=v.id AND j.status::text in ('pending','leased'))
 OR EXISTS(SELECT 1 FROM public.purchase_email_documents em
   WHERE em.invoice_id=v.id)
 OR EXISTS(SELECT 1 FROM private.purchase_invoice_delivery_reconciliations r
   WHERE r.invoice_id=v.id)
 THEN RAISE EXCEPTION 'Hielo capture participates in inventory, accounting, or concurrent processing'; END IF;
 INSERT INTO private.purchase_owner_retired_manual_scans(
 invoice_id,source_sha256,source_file_path,source_created_at,
 source_invoice_date,source_supplier_id,original_status,
 final_status,source_lines_retained,receipts_at_retirement,
 stock_movements_at_retirement,price_updates_at_retirement)
 VALUES(v.id,v.content_sha256,v.file_path,v.created_at,
 v.invoice_date,v.supplier_id,v.status,'discarded',v_count,0,0,0);
 UPDATE public.purchase_invoices SET status='discarded'
 WHERE id=v.id AND status='pending_mapping';
 IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent status change; rollback'; END IF;
END;
$retire$;
