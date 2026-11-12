-- Original Sanilec A/64199, SKU TW1702, 7 packs x 50 = 350 lid units.
-- Historic scanner 23-Oct classified this same SKU/quantity/amount
-- as expense_only and posted no stock. Original emailed PDF SHA is bound.
-- K4 price difference is only 0.000022 EUR/unit (0.023% rounding).
-- Apply a SINGLE purchase receipt, then LINK monthly A/20456 to that
-- existing stock without adding another movement.
CREATE TABLE IF NOT EXISTS private.purchase_sanilec_a64199_rounding_receipts_v1(
 original_line_id uuid PRIMARY KEY REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 scanned_line_id uuid NOT NULL UNIQUE REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 monthly_line_id uuid NOT NULL UNIQUE REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 receipt_id uuid NOT NULL UNIQUE REFERENCES public.purchase_receipt_confirmations(id) ON DELETE RESTRICT,
 stock_movement_id uuid NOT NULL UNIQUE REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
 ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
 original_pdf_sha text NOT NULL CHECK(original_pdf_sha~'^[0-9a-f]{64}$'),
 source_sku text NOT NULL CHECK(source_sku='TW1702'),
 source_net numeric(16,2) NOT NULL CHECK(source_net=33.31),
 quantity_uds int NOT NULL CHECK(quantity_uds=350),
 old_unit_price numeric(18,8) NOT NULL CHECK(old_unit_price=0.09515000),
 new_unit_price numeric(18,8) NOT NULL CHECK(new_unit_price=0.09517200),
 relative_price_change numeric(12,8) NOT NULL CHECK(relative_price_change<0.001),
 prior_scan_unreceived boolean NOT NULL CHECK(prior_scan_unreceived),
 monthly_added_stock boolean NOT NULL DEFAULT false CHECK(NOT monthly_added_stock),
 documented_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.purchase_sanilec_a64199_rounding_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_sanilec_a64199_rounding_receipts_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_sanilec_a64199_rounding_receipts_v1 TO service_role;

DO $certify$
DECLARE orig public.purchase_invoices%ROWTYPE;
 old_doc public.purchase_invoices%ROWTYPE;
 month_doc public.purchase_invoices%ROWTYPE;
 l public.purchase_invoice_lines%ROWTYPE;
 old_l public.purchase_invoice_lines%ROWTYPE;
 ml public.purchase_invoice_lines%ROWTYPE;
 p public.purchase_interpretation_proposals%ROWTYPE;
 old_p public.purchase_interpretation_proposals%ROWTYPE;
 mp public.purchase_interpretation_proposals%ROWTYPE;
 mapping public.purchase_mapping_versions%ROWTYPE;
 job public.document_processing_jobs%ROWTYPE;
 extract public.document_extractions%ROWTYPE;
 mj public.document_processing_jobs%ROWTYPE;
 me public.document_extractions%ROWTYPE;
 mail public.purchase_email_documents%ROWTYPE;
 source_row jsonb;
 pre jsonb;
 performed jsonb;
 receipt public.purchase_receipt_confirmations%ROWTYPE;
 movement public.stock_movements%ROWTYPE;
 before_price numeric;
 after_price numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('sanilec-A64199-TW1702-350units-unique',0));
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('request.jwt.claim.sub','1fa28f40-7c3e-48fb-87d5-d00bb485bd20',true);
 SELECT * INTO orig FROM public.purchase_invoices WHERE id='8b22b629-c480-49c4-b11b-382ea21c9998'::uuid FOR UPDATE;
 SELECT * INTO old_doc FROM public.purchase_invoices WHERE id='783ee56c-2d0a-4f9b-9620-4d4e410bf013'::uuid FOR KEY SHARE;
 SELECT * INTO month_doc FROM public.purchase_invoices WHERE id='e65af1cb-dec6-4da6-bd6b-e0b2ae4cc860'::uuid FOR UPDATE;
 IF orig.id IS NULL OR old_doc.id IS NULL OR month_doc.id IS NULL
 OR orig.status<>'pending_mapping' OR month_doc.status<>'pending_mapping'
 OR orig.invoice_number<>'A/64199' OR orig.invoice_date<>'2026-10-23'
 OR orig.source<>'email' OR orig.supplier_id<>9 OR orig.document_kind<>'delivery_note'
 OR orig.content_sha256<>'963d539dc24173658446d4ba2dcba9633195c14273f91504e6fa906f380ec8f6'
 OR orig.total_amount<>417.78
 OR month_doc.invoice_number<>'A/20456' OR month_doc.source<>'email'
 OR month_doc.supplier_id<>9 OR month_doc.document_kind<>'monthly_invoice'
 OR month_doc.content_sha256<>'4357ee7da8d4a8e2498c1d6a4495b869a526bac5e5cdefe2d7fcf64373733a3b'
 OR month_doc.base_amount<>673.80 OR month_doc.total_amount<>815.30
 OR old_doc.invoice_date<>'2026-10-23' OR old_doc.source<>'scanner'
 OR old_doc.supplier_id<>9 OR old_doc.status='discarded'
 OR (SELECT count(*) FROM public.purchase_invoice_lines ll WHERE ll.invoice_id=orig.id
 AND ll.superseded_by_extraction_id IS NULL)<>17
 OR (SELECT sum(ll.total_price) FROM public.purchase_invoice_lines ll WHERE ll.invoice_id=orig.id
 AND ll.superseded_by_extraction_id IS NULL)<>345.27
 THEN RAISE EXCEPTION 'Original Sanilec invoice, scanner or financial evidence changed'; END IF;

 SELECT * INTO mail FROM public.purchase_email_documents WHERE invoice_id=orig.id FOR KEY SHARE;
 SELECT * INTO job FROM public.document_processing_jobs WHERE invoice_id=orig.id FOR KEY SHARE;
 SELECT * INTO extract FROM public.document_extractions WHERE id=job.evidence_extraction_id FOR KEY SHARE;
 SELECT * INTO mj FROM public.document_processing_jobs WHERE invoice_id=month_doc.id FOR KEY SHARE;
 SELECT * INTO me FROM public.document_extractions WHERE id=mj.evidence_extraction_id FOR KEY SHARE;
 IF mail.id IS NULL OR job.id IS NULL OR extract.id IS NULL OR mj.id IS NULL OR me.id IS NULL
 OR mail.status<>'imported' OR mail.sender_email<>'pedido@sanilec.es'
 OR mail.gmail_message_id<>'1a167a3fe260e082'
 OR mail.content_sha256<>orig.content_sha256 OR mail.storage_path<>orig.file_path
 OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses a
   WHERE a.supplier_id=9 AND a.confirmed_by_owner AND a.sender_email=mail.sender_email)
 OR job.status<>'completed' OR extract.status<>'success'
 OR extract.invoice_id<>orig.id OR extract.file_version_hash<>orig.content_sha256
 OR extract.raw_json_artifact->>'extractor'<>'mistral'
 OR jsonb_array_length(extract.raw_json_artifact->'canonical'->'lines')<>17
 OR mj.status<>'completed' OR me.status<>'success'
 OR me.file_version_hash<>month_doc.content_sha256 OR me.invoice_id<>month_doc.id
 THEN RAISE EXCEPTION 'Original supplier PDF evidence or monthly extraction missing'; END IF;

 SELECT * INTO l FROM public.purchase_invoice_lines
 WHERE id='5fe38241-dd23-4f5d-874f-bcc562de8752'::uuid AND invoice_id=orig.id
 AND superseded_by_extraction_id IS NULL FOR UPDATE;
 SELECT * INTO old_l FROM public.purchase_invoice_lines
 WHERE id='20c314c8-61ae-4a71-b51a-6fe5465bf6ea'::uuid AND invoice_id=old_doc.id
 AND superseded_by_extraction_id IS NULL FOR KEY SHARE;
 SELECT * INTO ml FROM public.purchase_invoice_lines
 WHERE id='aa8e2979-78d1-4a32-b7ac-b25961b01978'::uuid AND invoice_id=month_doc.id
 AND superseded_by_extraction_id IS NULL FOR UPDATE;
 SELECT * INTO p FROM public.purchase_interpretation_proposals WHERE id=l.interpretation_proposal_id FOR KEY SHARE;
 SELECT * INTO old_p FROM public.purchase_interpretation_proposals WHERE id=old_l.interpretation_proposal_id FOR KEY SHARE;
 SELECT * INTO mp FROM public.purchase_interpretation_proposals WHERE id=ml.interpretation_proposal_id FOR KEY SHARE;
 SELECT * INTO mapping FROM public.purchase_mapping_versions WHERE id=p.mapping_version_id FOR KEY SHARE;
 IF l.id IS NULL OR old_l.id IS NULL OR ml.id IS NULL OR p.id IS NULL OR old_p.id IS NULL OR mp.id IS NULL OR mapping.id IS NULL
 OR l.status<>'mapped' OR ml.status<>'mapped'
 OR l.original_name<>'TAPA VASO CARTON 240 cc 8oz BIODEGRADABLE BLANCO (Pak 50 Uds.) gp'
 OR l.original_name<>ml.original_name OR l.original_name<>old_l.original_name
 OR l.quantity<>7 OR ml.quantity<>7 OR old_l.quantity<>7
 OR l.total_price<>33.31 OR ml.total_price<>33.31 OR old_l.total_price<>33.31
 OR l.unit_price<>4.7586 OR l.mapped_ingredient_id IS NULL
 OR l.mapped_ingredient_id<>ml.mapped_ingredient_id
 OR l.mapped_ingredient_id<>'a72c2896-b0e2-40a4-9b0d-f85aee9babff'::uuid
 OR p.source_row_index<>13 OR mp.source_row_index<>26
 OR p.observed->>'supplier_product_code_raw'<>'TW1702'
 OR mp.observed->>'supplier_product_code_raw'<>'TW1702'
 OR old_p.observed->>'supplier_product_code_raw'<>'TW1702'
 OR p.document_extraction_id<>extract.id OR mp.document_extraction_id<>me.id
 OR p.source_file_hash<>orig.content_sha256 OR mp.source_file_hash<>month_doc.content_sha256
 OR p.physical_quantity<>350 OR p.base_unit<>'ud' OR p.purchase_quantity<>350
 OR p.status<>'ready_for_review' OR p.mapping_version_id<>'1b8e7900-112f-4c90-b460-52814a73c133'::uuid
 OR mapping.status<>'confirmed' OR mapping.supplier_id<>9
 OR mapping.ingredient_id<>l.mapped_ingredient_id
 OR mapping.conversion_factor<>50 OR mapping.line_content_qty<>50
 OR mapping.line_content_unit<>'ud' OR mapping.line_billing_unit<>'pack'
 OR old_l.status<>'expense_only' OR old_l.mapped_ingredient_id IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_line_id IN (l.id,old_l.id))
 OR EXISTS(SELECT 1 FROM public.stock_movements sm WHERE sm.reference_id IN(l.id,old_l.id,ml.id) AND sm.movement_type='PURCHASE')
 OR EXISTS(SELECT 1 FROM private.purchase_invoice_delivery_reconciliations d
 WHERE d.invoice_line_id=ml.id OR d.original_delivery_line_id=l.id)
 OR public.purchase_invoice_line_stock_reconciled(ml.id,ml.mapped_ingredient_id)
 THEN RAISE EXCEPTION 'Source-bound TW1702 line not unique, or already received'; END IF;

 source_row:=extract.raw_json_artifact->'canonical'->'lines'->13;
 IF source_row->>'supplier_product_code_raw'<>'TW1702'
 OR source_row->>'description_raw'<>l.original_name
 OR replace(source_row->>'quantity_raw',',','.')::numeric<>7
 OR replace(source_row->>'line_total_raw',',','.')::numeric<>33.31
 THEN RAISE EXCEPTION 'Original 23-Oct emailed supplier row differs'; END IF;

 pre:=public.apply_receipt_line(l.id,mapping.id,'[]'::jsonb,'opendots-sanilec-TW1702-source-certified',true,p.id);
 before_price:=(pre->>'price_before')::numeric;
 after_price:=(pre->>'price_after')::numeric;
 IF pre->>'ok'<>'true' OR pre->>'preview'<>'true'
 OR (pre->>'physical_quantity')::numeric<>350 OR pre->>'base_unit'<>'ud'
 OR abs(before_price-0.09515)>0.00000001
 OR abs(after_price-0.095172)>0.00000001
 OR abs(after_price-before_price)/before_price>=0.001
 THEN RAISE EXCEPTION 'K4 price/physical mismatch: %',pre; END IF;

 performed:=public.apply_receipt_line(l.id,mapping.id,'[]'::jsonb,'opendots-sanilec-TW1702-source-certified',false,p.id);
 IF performed->>'ok'<>'true' OR performed->>'idempotent' IS DISTINCT FROM 'false'
 THEN RAISE EXCEPTION 'K4 receipt failed: %',performed; END IF;
 SELECT * INTO receipt FROM public.purchase_receipt_confirmations WHERE purchase_invoice_line_id=l.id FOR KEY SHARE;
 SELECT * INTO movement FROM public.stock_movements WHERE id=receipt.stock_movement_id FOR KEY SHARE;
 IF receipt.id IS NULL OR movement.id IS NULL OR receipt.purchase_invoice_id<>orig.id
 OR receipt.ingredient_id<>l.mapped_ingredient_id
 OR receipt.physical_quantity<>350 OR receipt.base_unit<>'ud'
 OR movement.movement_type<>'PURCHASE' OR movement.ingredient_id<>l.mapped_ingredient_id
 OR movement.quantity<>350 OR movement.unit<>'ud' OR movement.reference_id<>l.id
 THEN RAISE EXCEPTION 'K4 posted unexpected physical stock'; END IF;
 INSERT INTO private.purchase_sanilec_a64199_rounding_receipts_v1
 (original_line_id,scanned_line_id,monthly_line_id,receipt_id,stock_movement_id,ingredient_id,
  original_pdf_sha,source_sku,source_net,quantity_uds,old_unit_price,new_unit_price,
  relative_price_change,prior_scan_unreceived)
 VALUES (l.id,old_l.id,ml.id,receipt.id,movement.id,l.mapped_ingredient_id,
  orig.content_sha256,'TW1702',33.31,350,before_price,after_price,
  abs(after_price-before_price)/before_price,true);
 INSERT INTO private.purchase_invoice_delivery_reconciliations(
 invoice_line_id,original_delivery_line_id,original_receipt_id,invoice_id,
 source_extraction_id,source_hash,supplier_delivery_ref,supplier_delivery_date)
 VALUES(ml.id,l.id,receipt.id,month_doc.id,me.id,month_doc.content_sha256,'A/64199','2026-10-23'::date);
 IF NOT public.purchase_invoice_line_stock_reconciled(ml.id,ml.mapped_ingredient_id)
 THEN RAISE EXCEPTION 'Monthly invoice did not recognize original one-time stock'; END IF;
 INSERT INTO private.purchase_receipt_automation_audit(
 receipt_confirmation_id,interpretation_proposal_id,automation_actor_profile_id,captured_by_profile_id)
 VALUES(receipt.id,p.id,'1fa28f40-7c3e-48fb-87d5-d00bb485bd20'::uuid,orig.created_by)
 ON CONFLICT(receipt_confirmation_id) DO NOTHING;
 PERFORM public.sync_purchase_invoice_status(month_doc.id);
END;$certify$;