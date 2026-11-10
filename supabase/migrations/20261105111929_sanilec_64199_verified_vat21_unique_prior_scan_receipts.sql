-- Source-bound 21% gross/net verification for Sanilec A/64199.
-- The 17 printed detail amounts sum to 345.27 EUR, and the printed
-- document gross is 417.78 = ROUND(345.27*1.21,2).
-- The old scanner document from the same 23 Oct delivery had 17
-- expense_only rows and zero receipt confirmations: this is evidence of
-- a real delivery whose stock was never posted, NOT another purchase.
-- Post only a narrow set of already validated physical presentations.
-- Never silently repair old erroneous supplier package conversions.
CREATE TABLE IF NOT EXISTS private.purchase_sanilec_a64199_verified_receipts (
 invoice_line_id uuid PRIMARY KEY REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
 old_scanned_line_id uuid NOT NULL UNIQUE REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 receipt_confirmation_id uuid NOT NULL UNIQUE REFERENCES public.purchase_receipt_confirmations(id) ON DELETE RESTRICT,
 ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
 item_sku text NOT NULL,
 printed_gross numeric(16,2) NOT NULL CHECK(printed_gross=417.78),
 detail_net numeric(16,2) NOT NULL CHECK(detail_net=345.27),
 inferred_vat numeric(16,2) NOT NULL CHECK(inferred_vat=72.51),
 justified_vat_rate numeric(8,4) NOT NULL CHECK(justified_vat_rate=0.21),
 physical_quantity numeric NOT NULL CHECK(physical_quantity>0),
 base_unit text NOT NULL,
 normalized_price numeric(16,8) NOT NULL,
 no_prior_stock_for_scanner boolean NOT NULL DEFAULT true CHECK(no_prior_stock_for_scanner),
 rule_version text NOT NULL DEFAULT 'sanilec_original_email_A64199_vat21_unique_prior_scan_v1',
 recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.purchase_sanilec_a64199_verified_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_sanilec_a64199_verified_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_sanilec_a64199_verified_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.receive_verified_sanilec_A64199_20261023_v1(
 p_line_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 i public.purchase_invoices%ROWTYPE;
 old_i public.purchase_invoices%ROWTYPE;
 l public.purchase_invoice_lines%ROWTYPE;
 old_l public.purchase_invoice_lines%ROWTYPE;
 p public.purchase_interpretation_proposals%ROWTYPE;
 old_p public.purchase_interpretation_proposals%ROWTYPE;
 e public.document_extractions%ROWTYPE;
 mail public.purchase_email_documents%ROWTYPE;
 job public.document_processing_jobs%ROWTYPE;
 g public.ingredients%ROWTYPE;
 r public.purchase_receipt_confirmations%ROWTYPE;
 sm public.stock_movements%ROWTYPE;
 old_code text;
 old_line_id uuid;
 expect_quantity numeric;
 expect_unit text;
 origin_row jsonb;
 existing private.purchase_sanilec_a64199_verified_receipts%ROWTYPE;
 delta numeric;
 total_net numeric;
 count_lines int;
 count_pairs int;
 k4 jsonb;
 changed_price numeric;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_line_id IS NULL
 THEN RETURN jsonb_build_object('ok',false,'reason','service_role_only'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sanilec-A64199-certified-delivery-20261023',0));
 SELECT * INTO l FROM public.purchase_invoice_lines WHERE id=p_line_id
  AND invoice_id='8b22b629-c480-49c4-b11b-382ea21c9998'::uuid
  AND superseded_by_extraction_id IS NULL FOR UPDATE;
 IF l.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','line_not_in_original_delivery'); END IF;
 SELECT * INTO existing FROM private.purchase_sanilec_a64199_verified_receipts WHERE invoice_line_id=l.id;
 IF existing.invoice_line_id IS NOT NULL
 THEN RETURN jsonb_build_object('ok',true,'idempotent',true,'applied',false,
  'receipt_id',existing.receipt_confirmation_id,'stock_changed',false); END IF;
 SELECT * INTO i FROM public.purchase_invoices WHERE id=l.invoice_id FOR UPDATE;
 IF i.invoice_number<>'A/64199' OR i.invoice_date<>'2026-10-23'::date
  OR i.source<>'email' OR i.supplier_id<>9 OR i.document_kind<>'delivery_note'
  OR i.status<>'pending_mapping'
  OR i.duplicate_of_invoice_id IS NOT NULL
  OR i.content_sha256<>'963d539dc24173658446d4ba2dcba9633195c14273f91504e6fa906f380ec8f6'
  OR i.total_amount<>417.78
 THEN RETURN jsonb_build_object('ok',false,'reason','original_gmail_delivery_invoice_changed'); END IF;
 SELECT sum(total_price),count(*) INTO total_net,count_lines
 FROM public.purchase_invoice_lines WHERE invoice_id=i.id AND superseded_by_extraction_id IS NULL;
 IF count_lines<>17 OR total_net<>345.27
  OR round(total_net*1.21,2)<>i.total_amount
 THEN RETURN jsonb_build_object('ok',false,'reason','source_net_to_gross_21pct_not_exact'); END IF;
 SELECT * INTO job FROM public.document_processing_jobs WHERE invoice_id=i.id FOR KEY SHARE;
 SELECT * INTO e FROM public.document_extractions WHERE id=job.evidence_extraction_id FOR KEY SHARE;
 SELECT * INTO mail FROM public.purchase_email_documents WHERE invoice_id=i.id FOR KEY SHARE;
 IF job.id IS NULL OR e.id IS NULL OR mail.id IS NULL
  OR job.status<>'completed' OR e.status<>'success'
  OR job.file_version_hash<>i.content_sha256 OR e.file_version_hash<>i.content_sha256
  OR e.invoice_id<>i.id OR e.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
  OR e.raw_json_artifact->>'extractor'<>'mistral'
  OR e.raw_json_artifact->'canonical'->>'document_number_raw'<>'A/64199'
  OR replace(e.raw_json_artifact->'canonical'->>'total_raw',',','.')::numeric<>417.78
  OR (e.raw_json_artifact->'canonical'->>'subtotal_raw') IS NOT NULL
  OR (e.raw_json_artifact->'canonical'->>'tax_raw') IS NOT NULL
  OR jsonb_array_length(e.raw_json_artifact->'canonical'->'lines')<>17
  OR mail.status<>'imported' OR mail.sender_email<>'pedido@sanilec.es'
  OR mail.content_sha256<>i.content_sha256 OR mail.storage_path<>i.file_path
  OR mail.gmail_message_id<>'1a167a3fe260e082'
  OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses addr
    WHERE addr.supplier_id=9 AND addr.confirmed_by_owner
      AND addr.sender_email=mail.sender_email)
 THEN RETURN jsonb_build_object('ok',false,'reason','original_pdf_sha_issuer_ocr_or_sender_not_verified'); END IF;
 SELECT * INTO p FROM public.purchase_interpretation_proposals
  WHERE id=l.interpretation_proposal_id FOR KEY SHARE;
 SELECT * INTO g FROM public.ingredients WHERE id=l.mapped_ingredient_id FOR KEY SHARE;
 IF p.id IS NULL OR g.id IS NULL OR g.archived_at IS NOT NULL
  OR p.status<>'ready_for_review'
  OR cardinality(p.review_reasons)<>0
  OR p.warnings<>ARRAY['lineas_total_no_reconcilian']::text[]
  OR p.document_extraction_id<>e.id OR p.source_file_hash<>i.content_sha256
  OR p.purchase_invoice_id<>i.id OR p.supplier_id<>9
  OR p.mapping_version_id IS NULL OR p.ingredient_id<>g.id
  OR p.source_row_index IS NULL OR p.source_row_index<0 OR p.source_row_index>=17
  OR p.source_item_name<>l.original_name
  OR l.status<>'mapped' OR l.mapped_ingredient_id<>g.id
  OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r
      WHERE r.purchase_invoice_line_id=l.id)
  OR EXISTS(SELECT 1 FROM public.stock_movements sm
      WHERE sm.reference_id=l.id AND sm.movement_type='PURCHASE')
 THEN RETURN jsonb_build_object('ok',false,'reason','k5_mapping_or_duplicate_receipt_not_verified'); END IF;
 origin_row:=e.raw_json_artifact->'canonical'->'lines'->p.source_row_index;
 IF origin_row->>'supplier_product_code_raw'<>p.observed->>'supplier_product_code_raw'
 OR origin_row->>'description_raw'<>l.original_name
 OR replace(origin_row->>'line_total_raw',',','.')::numeric<>l.total_price
 OR replace(origin_row->>'quantity_raw',',','.')::numeric<>l.quantity
 THEN RETURN jsonb_build_object('ok',false,'reason','canonical_line_source_changed'); END IF;

 -- Every allowed line has an exact original scanned 23-Oct item. That
 -- scanner classified it as expense_only and posted NO stock. Conversions
 -- found incorrect elsewhere (12-pack microfiber, kg-vs-litre floor cleaner,
 -- 300m aluminium roll, 18x22 bag) are deliberately excluded.
 SELECT source_sku,prior_line,qty,unit
 INTO old_code,old_line_id,expect_quantity,expect_unit FROM (VALUES
  ('TW1073','d2751ec4-b2ec-489f-afa1-ed7368e85ed1'::uuid,50::numeric,'ud'::text),
  ('QM8190','2763e5a2-c4fe-4a21-813a-f6098a6f561b'::uuid,5000::numeric,'ml'),
  ('MM1130','fbf758c4-7a5d-419b-af8b-ef9b9ee5dd2c'::uuid,1::numeric,'ud'),
  ('SE1080','f6c6f53d-aebf-4c96-b91a-e425b929c173'::uuid,4000::numeric,'ud'),
  ('TW1703','282e0ad6-c9c4-49fc-a085-c2dc4d84dd41'::uuid,100::numeric,'ud'),
  ('TW1702','20c314c8-61ae-4a71-b51a-6fe5465bf6ea'::uuid,350::numeric,'ud')
 ) source(source_sku,prior_line,qty,unit)
 WHERE source.source_sku=p.observed->>'supplier_product_code_raw';
 IF old_line_id IS NULL
 THEN RETURN jsonb_build_object('ok',false,'reason','unsupported_ambiguous_sku_or_presentation'); END IF;
 SELECT * INTO old_l FROM public.purchase_invoice_lines
  WHERE id=old_line_id AND superseded_by_extraction_id IS NULL FOR KEY SHARE;
 SELECT * INTO old_i FROM public.purchase_invoices
  WHERE id=old_l.invoice_id FOR KEY SHARE;
 SELECT * INTO old_p FROM public.purchase_interpretation_proposals
  WHERE id=old_l.interpretation_proposal_id FOR KEY SHARE;
 IF old_i.id IS NULL OR old_l.id IS NULL OR old_p.id IS NULL
  OR old_i.id<>'783ee56c-2d0a-4f9b-9620-4d4e410bf013'::uuid
  OR old_i.supplier_id<>9 OR old_i.source<>'scanner'
  OR old_i.invoice_date<>'2026-10-23'::date
  OR old_l.status<>'expense_only' OR old_l.mapped_ingredient_id IS NOT NULL
  OR old_p.observed->>'supplier_product_code_raw'<>old_code
  OR old_l.quantity<>l.quantity OR old_l.total_price<>l.total_price
  OR p.physical_quantity<>expect_quantity OR p.base_unit<>expect_unit
  OR p.purchase_quantity<=0 OR p.normalized_unit_price<=0
  OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_line_id=old_l.id)
  OR EXISTS(SELECT 1 FROM public.stock_movements sm WHERE sm.reference_id=old_l.id AND sm.movement_type='PURCHASE')
 THEN RETURN jsonb_build_object('ok',false,'reason','prior_expense_only_scan_or_physical_quantity_not_verified'); END IF;
 PERFORM set_config('request.jwt.claim.sub',p.created_by::text,true);
 k4:=public.apply_receipt_line(l.id,p.mapping_version_id,'[]'::jsonb,'A/64199',true,p.id);
 IF k4->>'ok'<>'true' OR k4->>'preview'<>'true' OR
  (k4->>'physical_quantity')::numeric<>expect_quantity
  OR k4->>'base_unit'<>expect_unit
  OR (k4->>'normalized_unit_price')::numeric<>p.normalized_unit_price
  OR (k4->>'purchase_quantity')::numeric<>p.purchase_quantity
 THEN RETURN jsonb_build_object('ok',false,'reason','K4_preview_or_inventory_units_invalid'); END IF;
 changed_price:=abs((k4->>'price_after')::numeric-(k4->>'price_before')::numeric);
 IF (k4->>'price_before')::numeric<=0
  OR changed_price/(k4->>'price_before')::numeric>0.005
 THEN RETURN jsonb_build_object('ok',false,'reason','price_change_not_verified_within_half_percent'); END IF;
 IF p_preview THEN RETURN jsonb_build_object('ok',true,'eligible',true,
  'source_gross',417.78,'verified_net',345.27,'vat_derived',72.51,
  'vat_rate',21,'line_id',l.id,'ingredient_id',g.id,
  'source_scanned_line',old_l.id,'physical_quantity',expect_quantity,
  'base_unit',expect_unit,'price_after',(k4->>'price_after')::numeric,
  'stock_changed',false); END IF;
 k4:=public.apply_receipt_line(l.id,p.mapping_version_id,'[]'::jsonb,'A/64199',false,p.id);
 IF k4->>'ok'<>'true' OR (k4->>'applied' IS DISTINCT FROM 'true')
 THEN RAISE EXCEPTION 'Source-verified K4 receipt failed, rollback: %',k4->>'reason'; END IF;
 SELECT * INTO r FROM public.purchase_receipt_confirmations
 WHERE purchase_invoice_line_id=l.id AND ingredient_id=g.id FOR KEY SHARE;
 SELECT * INTO sm FROM public.stock_movements WHERE id=r.stock_movement_id FOR KEY SHARE;
 IF r.id IS NULL OR sm.id IS NULL OR sm.movement_type<>'PURCHASE'
  OR sm.ingredient_id<>g.id OR sm.quantity<>expect_quantity
  OR sm.unit<>expect_unit
 THEN RAISE EXCEPTION 'K4 physical purchase movement mismatch; rollback'; END IF;
 INSERT INTO private.purchase_sanilec_a64199_verified_receipts(
  invoice_line_id,invoice_id,old_scanned_line_id,receipt_confirmation_id,
  ingredient_id,source_sha256,item_sku,printed_gross,detail_net,inferred_vat,
  justified_vat_rate,physical_quantity,base_unit,normalized_price)
 VALUES(l.id,i.id,old_l.id,r.id,g.id,i.content_sha256,old_code,
  417.78,345.27,72.51,0.21,expect_quantity,expect_unit,
  p.normalized_unit_price);
 INSERT INTO private.purchase_receipt_automation_audit(
  receipt_confirmation_id,interpretation_proposal_id,
  automation_actor_profile_id,captured_by_profile_id)
 VALUES(r.id,p.id,p.created_by,i.created_by)
 ON CONFLICT(receipt_confirmation_id) DO NOTHING;
 RETURN jsonb_build_object('ok',true,'applied',true,'stock_changed',true,
  'line_id',l.id,'source_scanned_line',old_l.id,'receipt_id',r.id,
  'quantity',expect_quantity,'base_unit',expect_unit,'vat_derived',72.51,
  'old_scanned_expense_unchanged',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.receive_verified_sanilec_A64199_20261023_v1(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.receive_verified_sanilec_A64199_20261023_v1(uuid,boolean)
 TO service_role;