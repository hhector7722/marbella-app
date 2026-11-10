-- Exact original 23-Oct Sanilec 4oz cup SKU TW1740, 10 x 50 units.
-- Proven by a prior confirmed 500-unit receipt of identical supplier
-- item and the original invoice and monthly PDF hashes.
-- Mapping-only: no physical receipt, price or stock edits.
CREATE TABLE IF NOT EXISTS private.purchase_sanilec_a64199_cup_identity_v1 (
 invoice_line_id uuid PRIMARY KEY REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 predecessor_original_scan_line_id uuid NOT NULL REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 prior_confirmed_receipt_id uuid NOT NULL REFERENCES public.purchase_receipt_confirmations(id) ON DELETE RESTRICT,
 confirmed_mapping_version_id uuid NOT NULL REFERENCES public.purchase_mapping_versions(id) ON DELETE RESTRICT,
 verified_proposal_id uuid NOT NULL UNIQUE REFERENCES public.purchase_interpretation_proposals(id) ON DELETE RESTRICT,
 original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[0-9a-f]{64}$'),
 physical_quantity integer NOT NULL CHECK(physical_quantity=500),
 stock_changed boolean NOT NULL DEFAULT false CHECK(NOT stock_changed),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.purchase_sanilec_a64199_cup_identity_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_sanilec_a64199_cup_identity_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_sanilec_a64199_cup_identity_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_verified_sanilec_a64199_cups_4oz_v1(
 p_invoice_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 inv public.purchase_invoices%ROWTYPE;
 monthly public.purchase_invoice_lines%ROWTYPE;
 l public.purchase_invoice_lines%ROWTYPE;
 old_l public.purchase_invoice_lines%ROWTYPE;
 old_i public.purchase_invoices%ROWTYPE;
 orig public.purchase_interpretation_proposals%ROWTYPE;
 e public.document_extractions%ROWTYPE;
 mail public.purchase_email_documents%ROWTYPE;
 job public.document_processing_jobs%ROWTYPE;
 m public.purchase_mapping_versions%ROWTYPE;
 g public.ingredients%ROWTYPE;
 receipt public.purchase_receipt_confirmations%ROWTYPE;
 movement public.stock_movements%ROWTYPE;
 src jsonb;
 total_amount numeric;
 row_count integer;
 new_p uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role'
 OR p_invoice_id IS DISTINCT FROM '8b22b629-c480-49c4-b11b-382ea21c9998'::uuid
 THEN RETURN jsonb_build_object('ok',false,'reason','service_role_and_original_only'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sanilec-20261023-TW1740-mapping-only',0));
 SELECT * INTO inv FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
 SELECT * INTO l FROM public.purchase_invoice_lines WHERE
   id='ee965fbf-38f1-47d8-a5a7-6a95ed3c4598'::uuid AND invoice_id=inv.id
   AND superseded_by_extraction_id IS NULL FOR UPDATE;
 IF inv.id IS NULL OR l.id IS NULL
 OR inv.source<>'email' OR inv.supplier_id<>9 OR inv.document_kind<>'delivery_note'
 OR inv.status<>'pending_mapping' OR inv.invoice_date<>'2026-10-23'
 OR inv.invoice_number<>'A/64199' OR inv.duplicate_of_invoice_id IS NOT NULL
 OR inv.content_sha256<>'963d539dc24173658446d4ba2dcba9633195c14273f91504e6fa906f380ec8f6'
 OR inv.total_amount<>417.78 OR l.original_name<>
  'VASO CARTON Kraft 4oz (Pak 50 Uds)(Cj.20 Paks) do RPP: ENV/2023/000030369'
 OR l.quantity<>10 OR l.unit_price<>1.96 OR l.total_price<>19.60
 THEN RETURN jsonb_build_object('ok',false,'reason','original_cup_invoice_or_line_changed'); END IF;
 IF l.status='mapped' AND EXISTS (
  SELECT 1 FROM private.purchase_sanilec_a64199_cup_identity_v1 a
  WHERE a.invoice_line_id=l.id AND a.physical_quantity=500 AND NOT a.stock_changed)
 THEN RETURN jsonb_build_object('ok',true,'idempotent',true,'stock_changed',false); END IF;
 IF l.status<>'pending' OR l.line_unit IS NOT NULL
 OR l.mapped_ingredient_id IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations rc
  WHERE rc.purchase_invoice_line_id=l.id)
 OR EXISTS(SELECT 1 FROM public.stock_movements sm
  WHERE sm.reference_id=l.id AND sm.movement_type='PURCHASE')
 THEN RETURN jsonb_build_object('ok',false,'reason','original_cup_line_already_mutated'); END IF;
 SELECT count(*),sum(total_price) INTO row_count,total_amount
 FROM public.purchase_invoice_lines WHERE invoice_id=inv.id AND superseded_by_extraction_id IS NULL;
 IF row_count<>17 OR total_amount<>345.27 OR round(total_amount*1.21,2)<>417.78
 THEN RETURN jsonb_build_object('ok',false,'reason','source_net_VAT_not_21percent'); END IF;
 SELECT * INTO mail FROM public.purchase_email_documents WHERE invoice_id=inv.id FOR KEY SHARE;
 SELECT * INTO job FROM public.document_processing_jobs WHERE invoice_id=inv.id FOR KEY SHARE;
 SELECT * INTO e FROM public.document_extractions WHERE id=job.evidence_extraction_id FOR KEY SHARE;
 SELECT * INTO orig FROM public.purchase_interpretation_proposals WHERE id=l.interpretation_proposal_id FOR KEY SHARE;
 IF mail.id IS NULL OR job.id IS NULL OR e.id IS NULL OR orig.id IS NULL
 OR mail.status<>'imported' OR mail.sender_email<>'pedido@sanilec.es'
 OR mail.gmail_message_id<>'1a167a3fe260e082'
 OR mail.content_sha256<>inv.content_sha256 OR mail.storage_path<>inv.file_path
 OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses a
   WHERE a.supplier_id=9 AND a.confirmed_by_owner AND a.sender_email=mail.sender_email)
 OR job.status<>'completed' OR e.status<>'success' OR e.invoice_id<>inv.id
 OR e.file_version_hash<>inv.content_sha256 OR e.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
 OR e.raw_json_artifact->>'extractor'<>'mistral'
 OR replace(e.raw_json_artifact->'canonical'->>'total_raw',',','.')::numeric<>417.78
 OR jsonb_array_length(e.raw_json_artifact->'canonical'->'lines')<>17
 OR orig.purchase_invoice_id<>inv.id OR orig.document_extraction_id<>e.id
 OR orig.source_file_hash<>inv.content_sha256
 OR orig.source_row_index<>15
 OR orig.source_item_name<>l.original_name
 OR orig.observed->>'supplier_product_code_raw'<>'TW1740'
 OR orig.status<>'needs_review'
 OR orig.review_reasons<>ARRAY['presentacion_sin_validar']::text[]
 OR orig.warnings<>ARRAY['lineas_total_no_reconcilian']::text[]
 THEN RETURN jsonb_build_object('ok',false,'reason','source_gmail_OCR_or_review_evidence_not_verified'); END IF;
 src:=e.raw_json_artifact->'canonical'->'lines'->15;
 IF src->>'supplier_product_code_raw'<>'TW1740'
 OR src->>'description_raw'<>l.original_name
 OR src->>'quantity_raw'<>'10,00' OR src->>'unit_price_raw'<>'1,9600'
 OR src->>'line_total_raw'<>'19,60'
 THEN RETURN jsonb_build_object('ok',false,'reason','original_PDF_cup_row_changed'); END IF;
 SELECT * INTO m FROM public.purchase_mapping_versions WHERE id=
  'a72e7b54-5828-4edc-b61a-0498593a3f0a'::uuid FOR KEY SHARE;
 SELECT * INTO g FROM public.ingredients WHERE id=m.ingredient_id FOR KEY SHARE;
 SELECT * INTO receipt FROM public.purchase_receipt_confirmations
 WHERE mapping_version_id=m.id FOR KEY SHARE;
 SELECT * INTO movement FROM public.stock_movements WHERE id=receipt.stock_movement_id FOR KEY SHARE;
 SELECT * INTO monthly FROM public.purchase_invoice_lines WHERE
  id='e1e61135-d6c7-4281-a9a1-8c45aceab077'::uuid FOR KEY SHARE;
 SELECT * INTO old_l FROM public.purchase_invoice_lines WHERE
  id='a0f6e708-b3e2-42e5-9c7a-ccc47558c17b'::uuid FOR KEY SHARE;
 SELECT * INTO old_i FROM public.purchase_invoices WHERE id=old_l.invoice_id FOR KEY SHARE;
 IF m.id IS NULL OR g.id IS NULL OR receipt.id IS NULL OR movement.id IS NULL
 OR monthly.id IS NULL OR old_l.id IS NULL OR old_i.id IS NULL
 OR m.status<>'confirmed' OR m.supplier_id<>9
 OR m.supplier_item_name<>l.original_name OR m.conversion_factor<>50
 OR m.line_content_qty<>50 OR m.line_content_unit<>'ud' OR m.line_billing_unit<>'pack'
 OR g.id<>'71eda23a-41b7-49b9-af08-1c94e1111fa4'::uuid
 OR g.name<>'Vasos 120ml' OR g.archived_at IS NOT NULL
 OR g.base_unit<>'ud' OR g.purchase_unit<>'ud'
 OR receipt.ingredient_id<>g.id OR movement.ingredient_id<>g.id
 OR movement.quantity<>500 OR movement.unit<>'ud' OR movement.movement_type<>'PURCHASE'
 OR monthly.invoice_id<>'e65af1cb-dec6-4da6-bd6b-e0b2ae4cc860'::uuid
 OR monthly.original_name<>l.original_name OR monthly.quantity<>l.quantity
 OR monthly.total_price<>l.total_price OR monthly.mapped_ingredient_id<>g.id
 OR monthly.status<>'mapped'
 OR old_i.id<>'783ee56c-2d0a-4f9b-9620-4d4e410bf013'::uuid
 OR old_i.invoice_date<>'2026-10-23' OR old_i.supplier_id<>9 OR old_i.source<>'scanner'
 OR old_l.original_name<>l.original_name
 OR old_l.quantity<>l.quantity OR old_l.total_price<>l.total_price
 OR old_l.status<>'expense_only' OR old_l.mapped_ingredient_id IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r2
    WHERE r2.purchase_invoice_line_id=old_l.id)
 OR EXISTS(SELECT 1 FROM public.stock_movements sm
    WHERE sm.reference_id=old_l.id AND sm.movement_type='PURCHASE')
 THEN RETURN jsonb_build_object('ok',false,'reason','historical_500_cups_stock_or_Oct23_scanned_identity_not_unique'); END IF;
 IF p_preview THEN RETURN jsonb_build_object('ok',true,'eligible',true,
  'ingredient',g.name,'cups_per_pack',50,'purchased_packs',10,
  'physical_units',500,'net_amount',19.60,'normalized_unit_price',0.0392,
  'stock_changed',false,'old_expense_untouched',true); END IF;
 INSERT INTO public.purchase_interpretation_proposals (
  proposal_set_id,purchase_invoice_id,document_extraction_id,supplier_id,
  supplier_profile_id,supplier_profile_version,supplier_profile_hash,
  normalizer_version,source_file_hash,input_fingerprint,source_table_index,source_row_index,source_item_name,
  mapping_version_id,ingredient_id,status,observed,interpreted,normalized,
  pricing,proposed_allocations,review_reasons,warnings,
  line_quantity,line_unit,observed_unit_price,line_total,physical_quantity,base_unit,
  purchase_quantity,purchase_unit,normalized_unit_price,supersedes_proposal_id,created_by,provenance)
 VALUES (
  orig.proposal_set_id,inv.id,e.id,9,orig.supplier_profile_id,
  orig.supplier_profile_version,orig.supplier_profile_hash,orig.normalizer_version,
  inv.content_sha256,encode(sha256(convert_to(orig.input_fingerprint||':original-cup-500:'||m.id::text,'UTF8')),'hex'),
  orig.source_table_index,orig.source_row_index,l.original_name,
  m.id,g.id,'ready_for_review'::public.purchase_interpretation_proposal_status,
  orig.observed,orig.interpreted||jsonb_build_object('match_source','exact_historical_receipt_500cups'),
  orig.normalized||jsonb_build_object('physical_quantity',500,'base_unit','ud','purchase_quantity',500,
    'purchase_unit','ud','normalized_unit_price',0.0392),
  orig.pricing||jsonb_build_object('verified_net_line',19.60,'inferred_document_vat_21_percent',true),
  '[]'::jsonb,'{}'::text[],'{}'::text[],
  l.quantity,'pack',l.unit_price,l.total_price,500,'ud',500,'ud',0.0392,
  orig.id,orig.created_by,
  orig.provenance||jsonb_build_object('revision',jsonb_build_object(
   'kind','verified_source_historical_500_cups_pack_v1',
   'monthly_line_id',monthly.id,'prior_received_mapping',m.id,
   'original_scanned_expense',old_l.id,'stock_changed',false))
 ) RETURNING id INTO new_p;
 UPDATE public.purchase_invoice_lines
 SET status='mapped',mapped_ingredient_id=g.id,line_unit='pack',interpretation_proposal_id=new_p
 WHERE id=l.id AND status='pending' AND interpretation_proposal_id=orig.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent original cup line modification'; END IF;
 INSERT INTO private.purchase_sanilec_a64199_cup_identity_v1(
   invoice_line_id,predecessor_original_scan_line_id,prior_confirmed_receipt_id,
   confirmed_mapping_version_id,verified_proposal_id,original_sha256,physical_quantity)
 VALUES(l.id,old_l.id,receipt.id,m.id,new_p,inv.content_sha256,500);
 PERFORM public.sync_purchase_invoice_status(inv.id);
 RETURN jsonb_build_object('ok',true,'applied',true,'mapped',true,
  'physical_units',500,'stock_changed',false,'old_expense_untouched',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.prepare_verified_sanilec_a64199_cups_4oz_v1(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_verified_sanilec_a64199_cups_4oz_v1(uuid,boolean) TO service_role;