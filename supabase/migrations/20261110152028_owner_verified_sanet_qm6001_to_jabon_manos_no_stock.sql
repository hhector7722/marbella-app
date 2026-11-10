-- Owner confirmation, 10 Nov 2026:
-- Sanilec QM6001 SANET (Jabon manual) == canonical ingredient "Jabón Manos".
-- "Sanet jabón manual" is an already-archived historic duplicate whose
-- two old physical receipts remain immutable for audit. Never recreate.
-- Scope: one SHA-verified emailed delivery note, SKU routing and legacy
-- *supplier lookup* rows only. Zero stock movements, balances or prices.

CREATE TABLE IF NOT EXISTS private.purchase_owner_verified_sanet_identity_v1 (
 invoice_line_id uuid PRIMARY KEY REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
 canonical_ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
 archived_duplicate_ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 supplier_code text NOT NULL CHECK(supplier_code='QM6001'),
 original_proposal_id uuid NOT NULL REFERENCES public.purchase_interpretation_proposals(id) ON DELETE RESTRICT,
 approved_mapping_version_id uuid NOT NULL REFERENCES public.purchase_mapping_versions(id) ON DELETE RESTRICT,
 approved_proposal_id uuid NOT NULL UNIQUE REFERENCES public.purchase_interpretation_proposals(id) ON DELETE RESTRICT,
 physical_quantity_ml integer NOT NULL CHECK(physical_quantity_ml=5000),
 physical_stock_changed boolean NOT NULL DEFAULT false CHECK(NOT physical_stock_changed),
 legacy_supplier_lookups_corrected integer NOT NULL CHECK (legacy_supplier_lookups_corrected=7),
 historical_receipts_untouched boolean NOT NULL DEFAULT true CHECK (historical_receipts_untouched),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL DEFAULT 'Owner 2026-11-10: SANET QM6001 is Jabón Manos; Sanet jabón manual archived duplicate'
);
ALTER TABLE private.purchase_owner_verified_sanet_identity_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_owner_verified_sanet_identity_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_owner_verified_sanet_identity_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_owner_verified_sanet_qm6001_a64199_v1(
 p_invoice_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 inv public.purchase_invoices%ROWTYPE;
 l public.purchase_invoice_lines%ROWTYPE;
 old_scan public.purchase_invoice_lines%ROWTYPE;
 old_invoice public.purchase_invoices%ROWTYPE;
 target public.ingredients%ROWTYPE;
 alias_ing public.ingredients%ROWTYPE;
 old_p public.purchase_interpretation_proposals%ROWTYPE;
 e public.document_extractions%ROWTYPE;
 j public.document_processing_jobs%ROWTYPE;
 mail public.purchase_email_documents%ROWTYPE;
 version_row public.purchase_mapping_versions%ROWTYPE;
 source_row jsonb;
 new_p uuid;
 line_count int;
 net_total numeric;
 legacy_count int;
 receipt_count int;
 changed_count int;
 already private.purchase_owner_verified_sanet_identity_v1%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role'
 OR p_invoice_id IS DISTINCT FROM '8b22b629-c480-49c4-b11b-382ea21c9998'::uuid
 THEN RETURN jsonb_build_object('ok',false,'reason','service_role_original_only'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('owner-sanet-QM6001-A64199-20261110',0));
 SELECT * INTO inv FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
 SELECT * INTO l FROM public.purchase_invoice_lines WHERE
  id='d0c3070f-8a26-4f7b-87ec-f65424290dc4'::uuid AND invoice_id=inv.id
  AND superseded_by_extraction_id IS NULL FOR UPDATE;
 SELECT * INTO target FROM public.ingredients WHERE
  id='ca2313e1-16b6-4563-945b-a024ed05aa2e'::uuid FOR KEY SHARE;
 SELECT * INTO alias_ing FROM public.ingredients WHERE
  id='2297f02d-1265-4721-a57c-aa6f93ee255b'::uuid FOR KEY SHARE;
 SELECT * INTO already FROM private.purchase_owner_verified_sanet_identity_v1
 WHERE invoice_line_id=l.id;
 IF already.invoice_line_id IS NOT NULL AND l.status='mapped' AND
    l.mapped_ingredient_id=target.id AND already.canonical_ingredient_id=target.id
    AND NOT already.physical_stock_changed
 THEN
  RETURN jsonb_build_object('ok',true,'idempotent',true,'stock_changed',false,
    'ingredient',target.name,'retained_historic_duplicate',true);
 END IF;
 IF inv.id IS NULL OR l.id IS NULL OR target.id IS NULL OR alias_ing.id IS NULL
 OR inv.source<>'email' OR inv.supplier_id<>9
 OR inv.invoice_number<>'A/64199' OR inv.invoice_date<>'2026-10-23'
 OR inv.document_kind<>'delivery_note' OR inv.status<>'pending_mapping'
 OR inv.duplicate_of_invoice_id IS NOT NULL
 OR inv.content_sha256<>'963d539dc24173658446d4ba2dcba9633195c14273f91504e6fa906f380ec8f6'
 OR inv.total_amount<>417.78
 OR target.name<>'Jabón Manos' OR target.archived_at IS NOT NULL
 OR target.base_unit<>'ml' OR target.purchase_unit<>'l'
 OR alias_ing.name<>'Sanet jabón manual' OR alias_ing.archived_at IS NULL
 OR alias_ing.base_unit<>'ml' OR alias_ing.purchase_unit<>'l'
 OR alias_ing.stock_current<>0
 OR NOT EXISTS(SELECT 1 FROM public.ingredient_consolidation_aliases a
    WHERE a.duplicate_ingredient_id=alias_ing.id
      AND a.canonical_ingredient_id=target.id AND a.conversion_status='resolved')
 OR l.original_name<>'SANET (Jabón manual) Env. 5 lts. vd RPP: ENV/2023/000006035'
 OR l.status<>'pending' OR l.mapped_ingredient_id IS NOT NULL
 OR l.quantity<>5 OR l.unit_price<>1.156 OR l.total_price<>5.78
 OR l.line_unit IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations rc
    WHERE rc.purchase_invoice_line_id=l.id)
 OR EXISTS(SELECT 1 FROM public.stock_movements sm
    WHERE sm.reference_id=l.id AND sm.movement_type='PURCHASE')
 THEN RETURN jsonb_build_object('ok',false,'reason','original_document_or_ingredient_consolidation_conflict'); END IF;
 SELECT count(*),sum(total_price) INTO line_count,net_total
 FROM public.purchase_invoice_lines WHERE invoice_id=inv.id
 AND superseded_by_extraction_id IS NULL;
 IF line_count<>17 OR net_total<>345.27 OR round(net_total*1.21,2)<>inv.total_amount
 THEN RETURN jsonb_build_object('ok',false,'reason','source_invoice_economic_integrity'); END IF;

 SELECT * INTO old_scan FROM public.purchase_invoice_lines
 WHERE id='b6b87487-3039-40e6-b007-8b157fc7469d'::uuid FOR KEY SHARE;
 SELECT * INTO old_invoice FROM public.purchase_invoices
 WHERE id=old_scan.invoice_id FOR KEY SHARE;
 IF old_scan.id IS NULL OR old_invoice.id IS NULL
 OR old_invoice.id<>'783ee56c-2d0a-4f9b-9620-4d4e410bf013'::uuid
 OR old_invoice.source<>'scanner' OR old_invoice.supplier_id<>9
 OR old_invoice.invoice_date<>'2026-10-23' OR old_scan.status<>'expense_only'
 OR old_scan.mapped_ingredient_id IS NOT NULL OR old_scan.quantity<>5
 OR old_scan.total_price<>l.total_price
 OR old_scan.original_name NOT LIKE 'SANET (Jabón manual) Env. 5 lts.%'
 OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations rc
  WHERE rc.purchase_invoice_line_id=old_scan.id)
 THEN RETURN jsonb_build_object('ok',false,'reason','historical_duplicate_scanner_not_verified'); END IF;

 SELECT * INTO mail FROM public.purchase_email_documents WHERE invoice_id=inv.id FOR KEY SHARE;
 SELECT * INTO j FROM public.document_processing_jobs WHERE invoice_id=inv.id FOR KEY SHARE;
 SELECT * INTO e FROM public.document_extractions WHERE id=j.evidence_extraction_id FOR KEY SHARE;
 SELECT * INTO old_p FROM public.purchase_interpretation_proposals
 WHERE id=l.interpretation_proposal_id FOR KEY SHARE;
 IF mail.id IS NULL OR j.id IS NULL OR e.id IS NULL OR old_p.id IS NULL
 OR mail.status<>'imported' OR mail.sender_email<>'pedido@sanilec.es'
 OR mail.gmail_message_id<>'1a167a3fe260e082'
 OR mail.content_sha256<>inv.content_sha256 OR mail.storage_path<>inv.file_path
 OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses addr
  WHERE addr.supplier_id=9 AND addr.confirmed_by_owner AND addr.sender_email=mail.sender_email)
 OR j.status<>'completed' OR e.status<>'success'
 OR e.invoice_id<>inv.id OR e.file_version_hash<>inv.content_sha256
 OR e.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
 OR e.raw_json_artifact->>'extractor'<>'mistral'
 OR e.raw_json_artifact->'canonical'->>'document_number_raw'<>'A/64199'
 OR jsonb_array_length(e.raw_json_artifact->'canonical'->'lines')<>17
 OR old_p.document_extraction_id<>e.id OR old_p.purchase_invoice_id<>inv.id
 OR old_p.source_file_hash<>inv.content_sha256
 OR old_p.source_item_name<>l.original_name
 OR old_p.source_row_index<>9 OR old_p.source_table_index<>0
 OR old_p.normalizer_version<>'mistral-pipeline-v3'
 OR old_p.status<>'needs_mapping' OR old_p.ingredient_id IS NOT NULL
 OR old_p.mapping_version_id IS NOT NULL
 OR old_p.review_reasons<>ARRAY['varios_ingredientes_posibles']::text[]
 OR old_p.warnings<>ARRAY['lineas_total_no_reconcilian']::text[]
 OR old_p.observed->>'supplier_product_code_raw'<>'QM6001'
 OR old_p.provenance->>'source'<>'mistral_canonical'
 THEN RETURN jsonb_build_object('ok',false,'reason','original_ocr_or_supplier_not_verified'); END IF;

 source_row:=e.raw_json_artifact->'canonical'->'lines'->9;
 IF source_row->>'supplier_product_code_raw'<>'QM6001'
 OR source_row->>'description_raw'<>l.original_name
 OR source_row->>'quantity_raw'<>'5'
 OR source_row->>'unit_price_raw'<>'1,1560'
 OR source_row->>'line_total_raw'<>'5,78'
 THEN RETURN jsonb_build_object('ok',false,'reason','original_pdf_line_differs'); END IF;

 -- Existing monthly invoice already lists the canonical ingredient.
 IF NOT EXISTS(
   SELECT 1 FROM public.purchase_invoice_lines ml
   JOIN public.purchase_interpretation_proposals mp ON mp.id=ml.interpretation_proposal_id
   WHERE ml.invoice_id='e65af1cb-dec6-4da6-bd6b-e0b2ae4cc860'::uuid
    AND ml.original_name=l.original_name AND ml.quantity=5
    AND ml.total_price=5.78 AND ml.status='mapped'
    AND ml.mapped_ingredient_id=target.id
    AND mp.observed->>'supplier_product_code_raw'='QM6001'
 ) THEN RETURN jsonb_build_object('ok',false,'reason','verified_monthly_canonical_item_not_found'); END IF;

 SELECT count(*) INTO legacy_count FROM public.supplier_item_mappings
 WHERE supplier_id=9 AND supplier_item_name ILIKE 'SANET%'
 AND ingredient_id='45a7ab64-c05c-4c84-9509-855d7663b3a1'::uuid;
 IF legacy_count<>7
 THEN RETURN jsonb_build_object('ok',false,'reason','legacy_mappings_have_changed','observed',legacy_count); END IF;
 SELECT count(*) INTO receipt_count FROM public.purchase_receipt_confirmations
 WHERE ingredient_id=alias_ing.id;
 IF receipt_count<>2
 THEN RETURN jsonb_build_object('ok',false,'reason','historic_duplicate_receipts_unexpected'); END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_supplier_sku_rules
 WHERE supplier_id=9 AND supplier_code='QM6001')
 THEN RETURN jsonb_build_object('ok',false,'reason','verified_sku_rule_already_exists_or_conflicts'); END IF;
 IF p_preview THEN RETURN jsonb_build_object('ok',true,'eligible',true,
  'invoice',inv.invoice_number,'code','QM6001','ingredient',target.name,
  'physical_quantity_ml',5000,'purchase_quantity_l',5,
  'normalized_unit_price_eur_per_l',1.156,'legacy_supplier_rows_to_correct',legacy_count,
  'historic_duplicate_archived',true,'stock_changed',false,
  'historic_receipts_unchanged',true); END IF;

 INSERT INTO public.purchase_mapping_versions(
 supplier_id,supplier_item_name,ingredient_id,conversion_factor,
 line_billing_unit,line_content_qty,line_content_unit,status,
 source_document_extraction_id,idempotency_key,proposed_by,confirmed_by,confirmed_at,note)
 VALUES(9,l.original_name,target.id,1,
  'l',1,'l','confirmed'::public.purchase_mapping_version_status,
  e.id,'owner-20261110-sanet-qm6001-original-a64199:'||l.id::text,
  old_p.created_by,old_p.created_by,now(),
  'Owner confirmed QM6001 SANET => Jabón Manos. Historical archived alias is not active. Net €5.78 for 5 L. Original PDF SHA bound. No stock.')
 RETURNING * INTO version_row;

 INSERT INTO public.purchase_interpretation_proposals(
  proposal_set_id,purchase_invoice_id,document_extraction_id,supplier_id,
  supplier_profile_id,supplier_profile_version,supplier_profile_hash,
  normalizer_version,source_file_hash,input_fingerprint,
  source_table_index,source_row_index,source_item_name,
  mapping_version_id,ingredient_id,status,observed,interpreted,normalized,
  pricing,proposed_allocations,review_reasons,warnings,
  line_quantity,line_unit,observed_unit_price,line_total,
  physical_quantity,base_unit,purchase_quantity,purchase_unit,
  normalized_unit_price,supersedes_proposal_id,created_by,provenance)
 VALUES(
  old_p.proposal_set_id,inv.id,e.id,9,old_p.supplier_profile_id,
  old_p.supplier_profile_version,old_p.supplier_profile_hash,
  old_p.normalizer_version,inv.content_sha256,
  encode(sha256(convert_to(old_p.input_fingerprint||':owner-sanet-qm6001:'||version_row.id::text,'UTF8')),'hex'),
  old_p.source_table_index,old_p.source_row_index,l.original_name,
  version_row.id,target.id,'ready_for_review'::public.purchase_interpretation_proposal_status,
  old_p.observed,
  old_p.interpreted||jsonb_build_object('match_source','owner_confirmed_sanet_qm6001_jabon_manos'),
  old_p.normalized||jsonb_build_object('physical_quantity',5000,'base_unit','ml',
   'purchase_quantity',5,'purchase_unit','l','normalized_unit_price',1.156),
  old_p.pricing||jsonb_build_object('verified_net_total',5.78,'discount_not_reapplied',true),
  '[]'::jsonb,'{}'::text[],'{}'::text[],
  l.quantity,'l',l.unit_price,l.total_price,5000,'ml',5,'l',1.156,
  old_p.id,old_p.created_by,old_p.provenance||jsonb_build_object('revision',jsonb_build_object(
   'kind','owner_confirmed_sanet_qm6001_jabon_manos_without_stock_v1',
   'original_pdf_sha',inv.content_sha256,'archive_duplicate',alias_ing.id,
   'historic_receipts_not_changed',true,'stock_changed',false))
 ) RETURNING id INTO new_p;

 UPDATE public.purchase_invoice_lines
 SET status='mapped',mapped_ingredient_id=target.id,line_unit='l',
 interpretation_proposal_id=new_p
 WHERE id=l.id AND status='pending' AND interpretation_proposal_id=old_p.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent SANET invoice line update'; END IF;

 INSERT INTO public.purchase_supplier_sku_rules(
  supplier_id,supplier_code,expected_description,ingredient_id,mapping_version_id,
  owner_confirmed_at,note)
 VALUES(9,'QM6001',l.original_name,target.id,version_row.id,now(),
  'Owner confirms SANET is Jabón Manos. Archived Sanet jabón manual is historical only. 1 L billed = 1000 ml.')
 ON CONFLICT (supplier_id,supplier_code) DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent SKU rule creation'; END IF;

 UPDATE public.supplier_item_mappings SET ingredient_id=target.id
 WHERE supplier_id=9 AND supplier_item_name ILIKE 'SANET%'
 AND ingredient_id='45a7ab64-c05c-4c84-9509-855d7663b3a1'::uuid;
 GET DIAGNOSTICS changed_count = ROW_COUNT;
 IF changed_count<>7 THEN RAISE EXCEPTION 'Unexpected historical supplier mapping count: %',changed_count; END IF;

 INSERT INTO private.purchase_owner_verified_sanet_identity_v1(
  invoice_line_id,invoice_id,canonical_ingredient_id,archived_duplicate_ingredient_id,
  source_sha256,supplier_code,original_proposal_id,approved_mapping_version_id,
  approved_proposal_id,physical_quantity_ml,legacy_supplier_lookups_corrected)
 VALUES(l.id,inv.id,target.id,alias_ing.id,inv.content_sha256,'QM6001',
  old_p.id,version_row.id,new_p,5000,changed_count);

 PERFORM public.sync_purchase_invoice_status(inv.id);
 RETURN jsonb_build_object('ok',true,'applied',true,'stock_changed',false,
  'mapped_ingredient_id',target.id,'mapped_name',target.name,'physical_quantity_ml',5000,
  'legacy_supplier_lookups_corrected',changed_count,
  'duplicate_remains_archived',true,'historical_receipts_unchanged',true,
  'original_invoice_amounts_unchanged',true,'invoice_pending_stock',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.prepare_owner_verified_sanet_qm6001_a64199_v1(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_owner_verified_sanet_qm6001_a64199_v1(uuid,boolean)
 TO service_role;
