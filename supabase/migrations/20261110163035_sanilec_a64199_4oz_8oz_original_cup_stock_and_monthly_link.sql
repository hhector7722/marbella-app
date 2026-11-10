-- Two original cup items: 10 x 50 4oz cups and 30 x 50 8oz cups.
-- Sanilec's ORIGINAL emailed A/64199 PDF is independently SHA-verified.
-- 23-Oct older scanner was expense_only, never posted a purchase.
-- For 8oz it lost the quantity; the original PDF explicitly proves 30 packs.
-- Both K4 previews leave current unit prices unchanged.
-- This one atomic transaction applies two original PURCHASE receipts, then
-- only links each to its unique existing monthly invoice line.
-- No other product, nor ambiguous historical physical unit, is touched.
DO $original_cups$
DECLARE
 v_doc public.purchase_invoices%ROWTYPE;
 v_month public.purchase_invoices%ROWTYPE;
 v_old_doc public.purchase_invoices%ROWTYPE;
 v_email public.purchase_email_documents%ROWTYPE;
 v_job public.document_processing_jobs%ROWTYPE;
 v_ext public.document_extractions%ROWTYPE;
 v_mjob public.document_processing_jobs%ROWTYPE;
 v_mext public.document_extractions%ROWTYPE;
 v_line public.purchase_invoice_lines%ROWTYPE;
 v_old public.purchase_invoice_lines%ROWTYPE;
 v_month_line public.purchase_invoice_lines%ROWTYPE;
 v_p public.purchase_interpretation_proposals%ROWTYPE;
 v_oldp public.purchase_interpretation_proposals%ROWTYPE;
 v_mp public.purchase_interpretation_proposals%ROWTYPE;
 v_receipt public.purchase_receipt_confirmations%ROWTYPE;
 v_stock public.stock_movements%ROWTYPE;
 v_map public.purchase_mapping_versions%ROWTYPE;
 v_row record;
 v_preview jsonb;
 v_result jsonb;
 v_source jsonb;
 v_count int:=0;
 v_actor uuid:='1fa28f40-7c3e-48fb-87d5-d00bb485bd20';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('original-Sanilec-A64199-4oz-8oz-receipts-and-monthly-link',0));
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
 SELECT * INTO v_doc FROM public.purchase_invoices
 WHERE id='8b22b629-c480-49c4-b11b-382ea21c9998'::uuid FOR UPDATE;
 SELECT * INTO v_month FROM public.purchase_invoices
 WHERE id='e65af1cb-dec6-4da6-bd6b-e0b2ae4cc860'::uuid FOR UPDATE;
 SELECT * INTO v_old_doc FROM public.purchase_invoices
 WHERE id='783ee56c-2d0a-4f9b-9620-4d4e410bf013'::uuid FOR KEY SHARE;
 SELECT * INTO v_email FROM public.purchase_email_documents
 WHERE invoice_id=v_doc.id FOR KEY SHARE;
 SELECT * INTO v_job FROM public.document_processing_jobs
 WHERE invoice_id=v_doc.id FOR KEY SHARE;
 SELECT * INTO v_ext FROM public.document_extractions
 WHERE id=v_job.evidence_extraction_id FOR KEY SHARE;
 SELECT * INTO v_mjob FROM public.document_processing_jobs
 WHERE invoice_id=v_month.id FOR KEY SHARE;
 SELECT * INTO v_mext FROM public.document_extractions
 WHERE id=v_mjob.evidence_extraction_id FOR KEY SHARE;
 IF v_doc.id IS NULL OR v_month.id IS NULL OR v_old_doc.id IS NULL
 OR v_ext.id IS NULL OR v_mext.id IS NULL OR v_email.id IS NULL
 OR v_doc.source<>'email' OR v_doc.supplier_id<>9
 OR v_doc.invoice_number<>'A/64199' OR v_doc.invoice_date<>'2026-10-23'::date
 OR v_doc.document_kind<>'delivery_note' OR v_doc.status<>'pending_mapping'
 OR v_doc.total_amount<>417.78
 OR v_doc.content_sha256<>'963d539dc24173658446d4ba2dcba9633195c14273f91504e6fa906f380ec8f6'
 OR v_doc.duplicate_of_invoice_id IS NOT NULL
 OR v_month.source<>'email' OR v_month.supplier_id<>9
 OR v_month.invoice_number<>'A/20456' OR v_month.document_kind<>'monthly_invoice'
 OR v_month.status<>'pending_mapping'
 OR v_month.content_sha256<>'4357ee7da8d4a8e2498c1d6a4495b869a526bac5e5cdefe2d7fcf64373733a3b'
 OR v_month.base_amount<>673.80 OR v_month.total_amount<>815.30
 OR v_old_doc.source<>'scanner' OR v_old_doc.supplier_id<>9
 OR v_old_doc.invoice_date<>'2026-10-23'::date
 OR v_email.status<>'imported' OR v_email.gmail_message_id<>'1a167a3fe260e082'
 OR v_email.sender_email<>'pedido@sanilec.es'
 OR v_email.content_sha256<>v_doc.content_sha256
 OR v_email.storage_path<>v_doc.file_path
 OR v_job.status<>'completed' OR v_mjob.status<>'completed'
 OR v_ext.invoice_id<>v_doc.id OR v_ext.status<>'success'
 OR v_ext.file_version_hash<>v_doc.content_sha256
 OR v_mext.invoice_id<>v_month.id OR v_mext.status<>'success'
 OR v_mext.file_version_hash<>v_month.content_sha256
 OR jsonb_array_length(v_ext.raw_json_artifact->'canonical'->'lines')<>17
 OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses addr
  WHERE addr.supplier_id=9 AND addr.confirmed_by_owner
  AND addr.sender_email=v_email.sender_email)
 OR (SELECT count(*) FROM public.purchase_invoice_lines ll
  WHERE ll.invoice_id=v_doc.id AND ll.superseded_by_extraction_id IS NULL)<>17
 OR (SELECT sum(ll.total_price) FROM public.purchase_invoice_lines ll
  WHERE ll.invoice_id=v_doc.id AND ll.superseded_by_extraction_id IS NULL)<>345.27
 THEN RAISE EXCEPTION 'Original A/64199 supplier PDF or monthly source changed'; END IF;

 FOR v_row IN SELECT * FROM (VALUES
 ('ee965fbf-38f1-47d8-a5a7-6a95ed3c4598'::uuid,
 'a0f6e708-b3e2-42e5-9c7a-ccc47558c17b'::uuid,
 'e1e61135-d6c7-4281-a9a1-8c45aceab077'::uuid,
 'TW1740'::text,15::integer,28::integer,10::numeric,19.60::numeric,
 500::numeric,0.0392::numeric,false::boolean),
 ('e3ecdc13-fa39-4714-a31f-2392a8736161'::uuid,
 'ece817e5-18a7-4c1c-84c9-70bd98dbd676'::uuid,
 '471b8e98-b571-4544-95a7-1be68d3021ba'::uuid,
 'TW1750',16,29,30,88.05,1500,0.0587,true)
 ) AS x(original_line_id,scan_line_id,month_line_id,sku,original_index,month_index,
    packs,net_amount,physical_units,unit_cost,prior_quantity_was_missing)
 ORDER BY original_index LOOP
  SELECT * INTO v_line FROM public.purchase_invoice_lines
    WHERE id=v_row.original_line_id AND invoice_id=v_doc.id AND superseded_by_extraction_id IS NULL FOR UPDATE;
  SELECT * INTO v_old FROM public.purchase_invoice_lines
    WHERE id=v_row.scan_line_id AND invoice_id=v_old_doc.id AND superseded_by_extraction_id IS NULL FOR KEY SHARE;
  SELECT * INTO v_month_line FROM public.purchase_invoice_lines
    WHERE id=v_row.month_line_id AND invoice_id=v_month.id AND superseded_by_extraction_id IS NULL FOR UPDATE;
  SELECT * INTO v_p FROM public.purchase_interpretation_proposals
    WHERE id=v_line.interpretation_proposal_id FOR KEY SHARE;
  SELECT * INTO v_oldp FROM public.purchase_interpretation_proposals
    WHERE id=v_old.interpretation_proposal_id FOR KEY SHARE;
  SELECT * INTO v_mp FROM public.purchase_interpretation_proposals
    WHERE id=v_month_line.interpretation_proposal_id FOR KEY SHARE;
  SELECT * INTO v_map FROM public.purchase_mapping_versions
    WHERE id=v_p.mapping_version_id FOR KEY SHARE;
  IF v_line.id IS NULL OR v_old.id IS NULL OR v_month_line.id IS NULL
   OR v_p.id IS NULL OR v_oldp.id IS NULL OR v_mp.id IS NULL OR v_map.id IS NULL
   OR v_line.status<>'mapped' OR v_month_line.status<>'mapped'
   OR v_line.quantity<>v_row.packs OR v_month_line.quantity<>v_row.packs
   OR v_line.total_price<>v_row.net_amount OR v_month_line.total_price<>v_row.net_amount
   OR v_line.mapped_ingredient_id IS NULL
   OR v_line.mapped_ingredient_id<>v_month_line.mapped_ingredient_id
   OR v_p.document_extraction_id<>v_ext.id
   OR v_p.source_file_hash<>v_doc.content_sha256
   OR v_p.source_row_index<>v_row.original_index
   OR v_mp.source_file_hash<>v_month.content_sha256
   OR v_mp.document_extraction_id<>v_mext.id
   OR v_mp.source_row_index<>v_row.month_index
   OR v_p.observed->>'supplier_product_code_raw'<>v_row.sku
   OR v_mp.observed->>'supplier_product_code_raw'<>v_row.sku
   OR v_oldp.observed->>'supplier_product_code_raw'<>v_row.sku
   OR v_p.physical_quantity<>v_row.physical_units OR v_p.base_unit<>'ud'
   OR v_map.supplier_id<>9 OR v_map.status<>'confirmed'
   OR v_map.conversion_factor<>50 OR v_map.line_content_qty<>50
   OR v_map.line_content_unit<>'ud'
   OR v_old.status<>'expense_only' OR v_old.mapped_ingredient_id IS NOT NULL
   OR v_old.total_price<>v_row.net_amount
   OR (NOT v_row.prior_quantity_was_missing AND v_old.quantity<>v_row.packs)
   OR (v_row.prior_quantity_was_missing AND v_old.quantity IS NOT NULL)
   OR v_old.original_name<>v_line.original_name
   OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations rx
      WHERE rx.purchase_invoice_line_id IN(v_line.id,v_old.id))
   OR EXISTS(SELECT 1 FROM public.stock_movements sx
      WHERE sx.reference_id IN(v_line.id,v_old.id) AND sx.movement_type='PURCHASE')
   OR EXISTS(SELECT 1 FROM private.purchase_invoice_delivery_reconciliations d
      WHERE d.invoice_line_id=v_month_line.id OR d.original_delivery_line_id=v_line.id)
  THEN RAISE EXCEPTION 'Original cups historical evidence not unique for %',v_row.sku; END IF;

  v_source:=v_ext.raw_json_artifact->'canonical'->'lines'->v_row.original_index;
  IF v_source->>'supplier_product_code_raw'<>v_row.sku
   OR v_source->>'description_raw'<>v_line.original_name
   OR replace(v_source->>'quantity_raw',',','.')::numeric<>v_row.packs
   OR replace(v_source->>'line_total_raw',',','.')::numeric<>v_row.net_amount
  THEN RAISE EXCEPTION 'Original PDF cup quantity not proven for %',v_row.sku; END IF;

  v_preview:=public.apply_receipt_line(
   v_line.id,v_map.id,'[]'::jsonb,
   'opendots-source-verified-sanilec-a64199-cups-v1:'||v_line.id::text,
   true,v_p.id);
  IF v_preview->>'ok'<>'true' OR v_preview->>'preview'<>'true'
   OR v_preview->>'base_unit'<>'ud'
   OR (v_preview->>'physical_quantity')::numeric<>v_row.physical_units
   OR abs((v_preview->>'price_after')::numeric -
    (v_preview->>'price_before')::numeric)>0.00000001
   OR abs((v_preview->>'price_before')::numeric -
     v_row.unit_cost)>0.00000001
  THEN RAISE EXCEPTION 'K4 refused correct original cup receipt for %: %',v_row.sku,v_preview; END IF;

  v_result:=public.apply_receipt_line(
   v_line.id,v_map.id,'[]'::jsonb,
   'opendots-source-verified-sanilec-a64199-cups-v1:'||v_line.id::text,
   false,v_p.id);
  IF v_result->>'ok'<>'true' OR v_result->>'idempotent' IS DISTINCT FROM 'false'
  THEN RAISE EXCEPTION 'K4 receipt failed for %: %',v_row.sku,v_result; END IF;
  SELECT * INTO v_receipt FROM public.purchase_receipt_confirmations
   WHERE purchase_invoice_line_id=v_line.id FOR KEY SHARE;
  SELECT * INTO v_stock FROM public.stock_movements
   WHERE id=v_receipt.stock_movement_id FOR KEY SHARE;
  IF v_receipt.id IS NULL OR v_stock.id IS NULL
   OR v_receipt.physical_quantity<>v_row.physical_units
   OR v_receipt.ingredient_id<>v_line.mapped_ingredient_id
   OR v_receipt.price_changed
   OR v_stock.movement_type<>'PURCHASE' OR v_stock.quantity<>v_row.physical_units
   OR v_stock.unit<>'ud' OR v_stock.ingredient_id<>v_line.mapped_ingredient_id
  THEN RAISE EXCEPTION 'K4 posted cup quantity differs from original %',v_row.sku; END IF;

  INSERT INTO private.purchase_sanilec_a64199_physical_receipts_certified_v1(
   invoice_line_id,original_scan_line_id,invoice_id,receipt_id,stock_movement_id,
   supplier_sku,verified_pdf_sha256,original_net_line_amount,original_net_doc,
   original_gross_doc,physical_quantity,base_unit,price_before,price_after,
   no_economic_price_change,previous_scan_expense_only,single_stock_receipt)
  VALUES(v_line.id,v_old.id,v_doc.id,v_receipt.id,v_stock.id,
   v_row.sku,v_doc.content_sha256,v_row.net_amount,345.27,417.78,
   v_row.physical_units,'ud',
   (v_preview->>'price_before')::numeric,(v_preview->>'price_after')::numeric,true,true,true);

  INSERT INTO private.purchase_invoice_delivery_reconciliations(
    invoice_line_id,original_delivery_line_id,original_receipt_id,
    invoice_id,source_extraction_id,source_hash,
    supplier_delivery_ref,supplier_delivery_date)
  VALUES(v_month_line.id,v_line.id,v_receipt.id,v_month.id,v_mext.id,
   v_month.content_sha256,'A/64199','2026-10-23'::date);
  IF NOT public.purchase_invoice_line_stock_reconciled(
     v_month_line.id,v_month_line.mapped_ingredient_id)
  THEN RAISE EXCEPTION 'Monthly original cup was not reconciled %',v_row.sku; END IF;

  INSERT INTO private.purchase_receipt_automation_audit(
   receipt_confirmation_id,interpretation_proposal_id,
   automation_actor_profile_id,captured_by_profile_id)
  VALUES(v_receipt.id,v_p.id,v_actor,v_doc.created_by)
  ON CONFLICT(receipt_confirmation_id) DO NOTHING;
  v_count:=v_count+1;
 END LOOP;

 IF v_count<>2 THEN RAISE EXCEPTION 'Unexpected cup source count %',v_count; END IF;
 PERFORM public.sync_purchase_invoice_status(v_month.id);
END;
$original_cups$;
