-- Transactional, source-locked first stock receipts for six physically
-- unambiguous A/64199 lines. The 23-Oct scan holds the same products as
-- EXPENSE_ONLY with ZERO receipts. Original emailed document SHA verified.
-- K4 must independently confirm original K5 and exact physical quantities,
-- and MUST NOT change current unit cost. Any failure aborts ALL six.
-- Explicitly excludes incorrect historic 12-pack, 300m foil,
-- dimensional mismatch, and kg-to-litre conversion.
CREATE TABLE IF NOT EXISTS private.purchase_sanilec_a64199_physical_receipts_certified_v1(
 invoice_line_id uuid PRIMARY KEY REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 original_scan_line_id uuid NOT NULL UNIQUE REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
 receipt_id uuid NOT NULL UNIQUE REFERENCES public.purchase_receipt_confirmations(id) ON DELETE RESTRICT,
 stock_movement_id uuid NOT NULL UNIQUE REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
 supplier_sku text NOT NULL,
 verified_pdf_sha256 text NOT NULL CHECK (verified_pdf_sha256 ~ '^[0-9a-f]{64}$'),
 original_net_line_amount numeric(16,2) NOT NULL CHECK(original_net_line_amount>0),
 original_net_doc numeric(16,2) NOT NULL CHECK(original_net_doc=345.27),
 original_gross_doc numeric(16,2) NOT NULL CHECK(original_gross_doc=417.78),
 physical_quantity numeric NOT NULL CHECK(physical_quantity>0),
 base_unit text NOT NULL CHECK(base_unit IN('ml','ud')),
 price_before numeric(18,8) NOT NULL,
 price_after numeric(18,8) NOT NULL,
 no_economic_price_change boolean NOT NULL CHECK(no_economic_price_change),
 previous_scan_expense_only boolean NOT NULL CHECK(previous_scan_expense_only),
 single_stock_receipt boolean NOT NULL CHECK(single_stock_receipt),
 implemented_by text NOT NULL DEFAULT 'OpenDots source-bound original reconciliation on owner request',
 reconciled_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.purchase_sanilec_a64199_physical_receipts_certified_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_sanilec_a64199_physical_receipts_certified_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_sanilec_a64199_physical_receipts_certified_v1 TO service_role;

DO $certify$
DECLARE
 v_inv public.purchase_invoices%ROWTYPE;
 v_scan public.purchase_invoices%ROWTYPE;
 v_mail public.purchase_email_documents%ROWTYPE;
 v_job public.document_processing_jobs%ROWTYPE;
 v_ext public.document_extractions%ROWTYPE;
 v_line public.purchase_invoice_lines%ROWTYPE;
 v_prev public.purchase_invoice_lines%ROWTYPE;
 v_p public.purchase_interpretation_proposals%ROWTYPE;
 v_old_p public.purchase_interpretation_proposals%ROWTYPE;
 v_mapping public.purchase_mapping_versions%ROWTYPE;
 v_receipt public.purchase_receipt_confirmations%ROWTYPE;
 v_stock public.stock_movements%ROWTYPE;
 v_row jsonb;
 v_preview jsonb;
 v_applied jsonb;
 v_source record;
 v_cnt int;
 v_cents numeric;
 v_changed int:=0;
 v_actor uuid:='1fa28f40-7c3e-48fb-87d5-d00bb485bd20'::uuid;
 v_expected_ingredient uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('sanilec-A64199-20261023-six-certain-physical-receipts',0));
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);

 SELECT * INTO v_inv FROM public.purchase_invoices
 WHERE id='8b22b629-c480-49c4-b11b-382ea21c9998'::uuid FOR UPDATE;
 SELECT * INTO v_scan FROM public.purchase_invoices
 WHERE id='783ee56c-2d0a-4f9b-9620-4d4e410bf013'::uuid FOR KEY SHARE;
 IF v_inv.id IS NULL OR v_scan.id IS NULL
   OR v_inv.source<>'email' OR v_inv.supplier_id<>9
   OR v_inv.invoice_number<>'A/64199' OR v_inv.invoice_date<>'2026-10-23'::date
   OR v_inv.document_kind<>'delivery_note' OR v_inv.status<>'pending_mapping'
   OR v_inv.total_amount<>417.78
   OR v_inv.duplicate_of_invoice_id IS NOT NULL
   OR v_inv.content_sha256<>'963d539dc24173658446d4ba2dcba9633195c14273f91504e6fa906f380ec8f6'
   OR v_scan.source<>'scanner' OR v_scan.supplier_id<>9
   OR v_scan.invoice_date<>'2026-10-23'::date
 THEN RAISE EXCEPTION 'Original source delivery or prior scanner identity changed'; END IF;
 SELECT count(*),coalesce(sum(total_price),0) INTO v_cnt,v_cents
 FROM public.purchase_invoice_lines
 WHERE invoice_id=v_inv.id AND superseded_by_extraction_id IS NULL;
 IF v_cnt<>17 OR v_cents<>345.27 OR round(v_cents*1.21,2)<>417.78
 THEN RAISE EXCEPTION 'Original 17-row net/gross economics changed'; END IF;
 SELECT * INTO v_mail FROM public.purchase_email_documents
 WHERE invoice_id=v_inv.id FOR KEY SHARE;
 SELECT * INTO v_job FROM public.document_processing_jobs
 WHERE invoice_id=v_inv.id FOR KEY SHARE;
 SELECT * INTO v_ext FROM public.document_extractions
 WHERE id=v_job.evidence_extraction_id FOR KEY SHARE;
 IF v_mail.id IS NULL OR v_job.id IS NULL OR v_ext.id IS NULL
  OR v_mail.status<>'imported' OR v_mail.sender_email<>'pedido@sanilec.es'
  OR v_mail.gmail_message_id<>'1a167a3fe260e082'
  OR v_mail.content_sha256<>v_inv.content_sha256
  OR v_mail.storage_path<>v_inv.file_path
  OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses a
   WHERE a.supplier_id=9 AND a.confirmed_by_owner
     AND a.sender_email=v_mail.sender_email)
  OR v_job.status<>'completed' OR v_job.file_version_hash<>v_inv.content_sha256
  OR v_ext.invoice_id<>v_inv.id OR v_ext.status<>'success'
  OR v_ext.file_version_hash<>v_inv.content_sha256
  OR v_ext.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
  OR v_ext.raw_json_artifact->>'extractor'<>'mistral'
  OR jsonb_array_length(v_ext.raw_json_artifact->'canonical'->'lines')<>17
  OR v_ext.raw_json_artifact->'canonical'->>'document_number_raw'<>'A/64199'
  OR replace(v_ext.raw_json_artifact->'canonical'->>'total_raw',',','.')::numeric<>417.78
 THEN RAISE EXCEPTION 'Original Gmail document or extraction no longer certified'; END IF;

 -- Check and post six *precisely identified* original lines, all-or-nothing.
 FOR v_source IN SELECT * FROM (VALUES
 ('63fa23af-3830-4599-a33e-16bf1224255f'::uuid,
  'd2751ec4-b2ec-489f-afa1-ed7368e85ed1'::uuid,
  'TW1073'::text,1::numeric,10.75::numeric,50::numeric,'ud'::text,0.215::numeric),
 ('beb2c645-2177-4653-9dfb-9a6ef9f5dae8'::uuid,
  '2763e5a2-c4fe-4a21-813a-f6098a6f561b'::uuid,
  'QM8190',5,3.20,5000,'ml',0.64),
 ('93a23388-f914-421c-b268-8b782c7af348'::uuid,
  'fbf758c4-7a5d-419b-af8b-ef9b9ee5dd2c'::uuid,
  'MM1130',1,1.62,1,'ud',1.62),
 ('d0c3070f-8a26-4f7b-87ec-f65424290dc4'::uuid,
  'b6b87487-3039-40e6-b007-8b157fc7469d'::uuid,
  'QM6001',5,5.78,5000,'ml',1.156),
 ('a2b3647c-3e98-4841-aab7-429a980d9bc8'::uuid,
  'f6c6f53d-aebf-4c96-b91a-e425b929c173'::uuid,
  'SE1080',1,28.27,4000,'ud',0.0070675),
 ('2d3c0258-f9b3-45bf-afe5-5c16fd28ee8a'::uuid,
  '282e0ad6-c9c4-49fc-a085-c2dc4d84dd41'::uuid,
  'TW1703',2,6.86,100,'ud',0.0686)
 ) x(line_id,scanned_line_id,sku,supplier_qty,net_amount,physical_qty,base_unit,
     price_before)
 ORDER BY x.sku LOOP
  SELECT * INTO v_line FROM public.purchase_invoice_lines
   WHERE id=v_source.line_id AND invoice_id=v_inv.id
    AND superseded_by_extraction_id IS NULL FOR UPDATE;
  SELECT * INTO v_prev FROM public.purchase_invoice_lines
   WHERE id=v_source.scanned_line_id AND invoice_id=v_scan.id
    AND superseded_by_extraction_id IS NULL FOR KEY SHARE;
  SELECT * INTO v_p FROM public.purchase_interpretation_proposals
   WHERE id=v_line.interpretation_proposal_id FOR KEY SHARE;
  SELECT * INTO v_old_p FROM public.purchase_interpretation_proposals
   WHERE id=v_prev.interpretation_proposal_id FOR KEY SHARE;
  SELECT * INTO v_mapping FROM public.purchase_mapping_versions
   WHERE id=v_p.mapping_version_id FOR KEY SHARE;

  IF v_line.id IS NULL OR v_prev.id IS NULL OR v_p.id IS NULL
    OR v_old_p.id IS NULL OR v_mapping.id IS NULL
    OR v_line.status<>'mapped'
    OR v_line.mapped_ingredient_id IS NULL
    OR v_line.quantity<>v_source.supplier_qty
    OR v_line.total_price<>v_source.net_amount
    OR v_p.purchase_invoice_id<>v_inv.id
    OR v_p.document_extraction_id<>v_ext.id
    OR v_p.source_file_hash<>v_inv.content_sha256
    OR v_p.status<>'ready_for_review'
    OR v_p.observed->>'supplier_product_code_raw'<>v_source.sku
    OR v_p.physical_quantity<>v_source.physical_qty
    OR v_p.base_unit<>v_source.base_unit
    OR v_mapping.supplier_id<>9 OR v_mapping.ingredient_id<>v_line.mapped_ingredient_id
    OR v_mapping.supplier_item_name<>v_line.original_name
    OR v_prev.status<>'expense_only'
    OR v_prev.mapped_ingredient_id IS NOT NULL
    OR v_prev.quantity<>v_line.quantity
    OR v_prev.total_price<>v_line.total_price
    OR v_old_p.observed->>'supplier_product_code_raw'<>v_source.sku
    OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations rr
     WHERE rr.purchase_invoice_line_id IN(v_line.id,v_prev.id))
    OR EXISTS(SELECT 1 FROM public.stock_movements mm
     WHERE mm.reference_id IN(v_line.id,v_prev.id) AND mm.movement_type='PURCHASE')
    OR EXISTS(SELECT 1 FROM private.purchase_sanilec_a64199_physical_receipts_certified_v1 aa
     WHERE aa.invoice_line_id=v_line.id)
  THEN RAISE EXCEPTION 'Source receipt identity not unique for SKU %',v_source.sku; END IF;
  v_row:=v_ext.raw_json_artifact->'canonical'->'lines'->v_p.source_row_index;
  IF v_row->>'supplier_product_code_raw'<>v_source.sku
   OR v_row->>'description_raw'<>v_line.original_name
   OR replace(v_row->>'quantity_raw',',','.')::numeric<>v_line.quantity
   OR replace(v_row->>'line_total_raw',',','.')::numeric<>v_line.total_price
  THEN RAISE EXCEPTION 'Immutable original OCR evidence changed for SKU %',v_source.sku; END IF;

  v_preview:=public.apply_receipt_line(
   v_line.id,v_mapping.id,'[]'::jsonb,
   'opendots-source-verified-sanilec-a64199-v1:'||v_line.id::text,
   true,v_p.id);
  IF v_preview->>'ok'<>'true' OR v_preview->>'preview'<>'true'
    OR (v_preview->>'physical_quantity')::numeric<>v_source.physical_qty
    OR v_preview->>'base_unit'<>v_source.base_unit
    OR abs((v_preview->>'price_after')::numeric -
      (v_preview->>'price_before')::numeric)>0.00000001
    OR abs((v_preview->>'price_before')::numeric -
      v_source.price_before)>0.00000001
  THEN RAISE EXCEPTION 'K4 price, mapping, or physical preview failed for SKU %: %',
      v_source.sku,v_preview; END IF;

  v_applied:=public.apply_receipt_line(
   v_line.id,v_mapping.id,'[]'::jsonb,
   'opendots-source-verified-sanilec-a64199-v1:'||v_line.id::text,
   false,v_p.id);
  IF v_applied->>'ok'<>'true'
   OR v_applied->>'idempotent' IS DISTINCT FROM 'false'
   OR v_applied->>'confirmation_id' IS NULL
   OR v_applied->>'stock_movement_id' IS NULL
  THEN RAISE EXCEPTION 'K4 certified original receipt not applied for SKU %: %',
   v_source.sku,v_applied; END IF;

  SELECT * INTO v_receipt FROM public.purchase_receipt_confirmations
  WHERE purchase_invoice_line_id=v_line.id FOR KEY SHARE;
  SELECT * INTO v_stock FROM public.stock_movements
   WHERE id=v_receipt.stock_movement_id FOR KEY SHARE;
  IF v_receipt.id IS NULL OR v_stock.id IS NULL
    OR v_receipt.ingredient_id<>v_line.mapped_ingredient_id
    OR v_stock.movement_type<>'PURCHASE'
    OR v_stock.ingredient_id<>v_line.mapped_ingredient_id
    OR v_stock.quantity<>v_source.physical_qty
    OR v_stock.unit<>v_source.base_unit
    OR v_receipt.physical_quantity<>v_source.physical_qty
    OR v_receipt.base_unit<>v_source.base_unit
    OR v_receipt.price_changed
  THEN RAISE EXCEPTION 'Posted stock / receipt not the independently verified SKU %',v_source.sku; END IF;

  INSERT INTO private.purchase_sanilec_a64199_physical_receipts_certified_v1(
   invoice_line_id,original_scan_line_id,invoice_id,receipt_id,
   stock_movement_id,supplier_sku,verified_pdf_sha256,
   original_net_line_amount,original_net_doc,original_gross_doc,
   physical_quantity,base_unit,price_before,price_after,
   no_economic_price_change,previous_scan_expense_only,single_stock_receipt)
  VALUES(v_line.id,v_prev.id,v_inv.id,v_receipt.id,v_stock.id,
   v_source.sku,v_inv.content_sha256,v_source.net_amount,
   345.27,417.78,v_source.physical_qty,v_source.base_unit,
   (v_preview->>'price_before')::numeric,(v_preview->>'price_after')::numeric,
   true,true,true);

  INSERT INTO private.purchase_receipt_automation_audit(
   receipt_confirmation_id,interpretation_proposal_id,
   automation_actor_profile_id,captured_by_profile_id)
  VALUES(v_receipt.id,v_p.id,v_actor,v_inv.created_by)
  ON CONFLICT(receipt_confirmation_id) DO NOTHING;
  v_changed:=v_changed+1;
 END LOOP;

 IF v_changed<>6 THEN RAISE EXCEPTION 'Expected six atomic certified receipts, got %',v_changed; END IF;
END;
$certify$;
