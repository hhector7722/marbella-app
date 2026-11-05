-- Owner-supplied employee measurements from the three vacuum-bag packs:
-- small 14x19cm, medium 20x29cm, large 28x40cm (orientation normalized).
-- Supplier BV1011: nominal 150x200mm (15x20cm) is nearest to small,
-- differing 10mm along each edge; store this distinction explicitly.
-- Identity ONLY: source invoice remains pending and no STOCK / price is posted.
CREATE TABLE IF NOT EXISTS private.purchase_supplier_vacuum_bag_measures (
 supplier_id integer NOT NULL REFERENCES public.suppliers(id),
 size_label text NOT NULL CHECK(size_label IN ('S','M','L')),
 measured_short_mm integer NOT NULL CHECK(measured_short_mm>0),
 measured_long_mm integer NOT NULL CHECK(measured_long_mm>measured_short_mm),
 nominal_short_mm integer,
 nominal_long_mm integer,
 supplier_sku text,
 source_context text NOT NULL,
 approximate boolean NOT NULL DEFAULT true CHECK(approximate=true),
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(supplier_id,size_label),
 CHECK((nominal_short_mm IS NULL)=(nominal_long_mm IS NULL))
);
ALTER TABLE private.purchase_supplier_vacuum_bag_measures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_supplier_vacuum_bag_measures FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_supplier_vacuum_bag_measures TO service_role;

INSERT INTO private.purchase_supplier_vacuum_bag_measures
 (supplier_id,size_label,measured_short_mm,measured_long_mm,
  nominal_short_mm,nominal_long_mm,supplier_sku,source_context)
VALUES
 (9,'S',140,190,150,200,'BV1011','Owner-shared employee measurement; small 19x14cm; supplier nominal 150x200mm is 10mm greater on each edge'),
 (9,'M',200,290,NULL,NULL,NULL,'Owner-shared employee measurement; medium 29x20cm'),
 (9,'L',280,400,NULL,NULL,NULL,'Owner-shared employee measurement; large 40x28cm')
ON CONFLICT(supplier_id,size_label) DO NOTHING;

CREATE TABLE IF NOT EXISTS private.purchase_verified_supplier_dimension_identity (
 invoice_line_id uuid PRIMARY KEY REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
 ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 supplier_sku text NOT NULL CHECK(supplier_sku='BV1011'),
 measured_short_mm integer NOT NULL CHECK(measured_short_mm=140),
 measured_long_mm integer NOT NULL CHECK(measured_long_mm=190),
 nominal_short_mm integer NOT NULL CHECK(nominal_short_mm=150),
 nominal_long_mm integer NOT NULL CHECK(nominal_long_mm=200),
 units_per_case integer NOT NULL CHECK(units_per_case=1000),
 mapping_approximate boolean NOT NULL DEFAULT true CHECK(mapping_approximate=true),
 economic_review_retained boolean NOT NULL DEFAULT true CHECK(economic_review_retained=true),
 physical_receipt_unconfirmed boolean NOT NULL DEFAULT true CHECK(physical_receipt_unconfirmed=true),
 stock_changed boolean NOT NULL DEFAULT false CHECK(stock_changed=false),
 rule_version text NOT NULL DEFAULT 'sanilec_BV1011_150x200_nearest_owner_measured_small_v1',
 verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.purchase_verified_supplier_dimension_identity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_verified_supplier_dimension_identity FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_verified_supplier_dimension_identity TO service_role;

CREATE OR REPLACE FUNCTION public.learn_verified_sanilec_vacuum_bag_small_v1(
 p_invoice_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_i public.purchase_invoices%ROWTYPE;
 v_l public.purchase_invoice_lines%ROWTYPE;
 v_g public.ingredients%ROWTYPE;
 v_p public.purchase_interpretation_proposals%ROWTYPE;
 v_e public.document_extractions%ROWTYPE;
 v_mail public.purchase_email_documents%ROWTYPE;
 v_job public.document_processing_jobs%ROWTYPE;
 v_size private.purchase_supplier_vacuum_bag_measures%ROWTYPE;
 v_row jsonb;
 v_count integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_invoice_id IS NULL
 THEN RETURN jsonb_build_object('ok',false,'reason','service_role_only'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sanilec-BV1011-size:'||p_invoice_id::text,0));
 SELECT * INTO v_i FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF v_i.id IS NULL OR v_i.supplier_id<>9 OR v_i.source<>'email'
  OR v_i.document_kind<>'monthly_invoice' OR v_i.status<>'pending_mapping'
  OR v_i.duplicate_of_invoice_id IS NOT NULL
  OR v_i.content_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('ok',false,'reason','not_verified_sanilec_monthly_invoice'); END IF;

 SELECT * INTO v_g FROM public.ingredients
 WHERE id='c475a658-ebe2-4345-b5c7-8a7a52278f85'::uuid FOR KEY SHARE;
 SELECT * INTO v_size FROM private.purchase_supplier_vacuum_bag_measures
 WHERE supplier_id=9 AND size_label='S' FOR KEY SHARE;
 SELECT count(*) INTO v_count FROM private.purchase_supplier_vacuum_bag_measures
 WHERE supplier_id=9 AND size_label IN ('S','M','L');
 IF v_g.id IS NULL OR v_g.name<>'Bolsa vacio S' OR v_g.archived_at IS NOT NULL
  OR v_g.base_unit<>'ud' OR v_g.purchase_unit<>'ud'
  OR v_count<>3
  OR v_size.measured_short_mm<>140 OR v_size.measured_long_mm<>190
  OR v_size.nominal_short_mm<>150 OR v_size.nominal_long_mm<>200
  OR v_size.supplier_sku<>'BV1011'
  OR abs(v_size.measured_short_mm-v_size.nominal_short_mm)>10
  OR abs(v_size.measured_long_mm-v_size.nominal_long_mm)>10
  OR EXISTS(SELECT 1 FROM private.purchase_supplier_vacuum_bag_measures bigger
    WHERE bigger.supplier_id=9 AND bigger.size_label IN ('M','L')
    AND abs(bigger.measured_short_mm-150)+abs(bigger.measured_long_mm-200)
      <=abs(v_size.measured_short_mm-150)+abs(v_size.measured_long_mm-200))
 THEN RETURN jsonb_build_object('ok',false,'reason','physical_measurements_not_unique_or_compatible'); END IF;

 SELECT * INTO v_l FROM public.purchase_invoice_lines
 WHERE invoice_id=v_i.id AND original_name=
   'BOLSA DE VACIO 150x200 (Cj.1000) pm RPP: ENV/2023/000016280'
   AND superseded_by_extraction_id IS NULL FOR UPDATE;
 SELECT count(*) INTO v_count FROM public.purchase_invoice_lines
 WHERE invoice_id=v_i.id AND original_name=
   'BOLSA DE VACIO 150x200 (Cj.1000) pm RPP: ENV/2023/000016280'
   AND superseded_by_extraction_id IS NULL;
 IF v_count<>1 OR v_l.id IS NULL OR v_l.status<>'pending'
  OR v_l.quantity<=0 OR v_l.line_unit IS NOT NULL
  OR (v_l.mapped_ingredient_id IS NOT NULL AND v_l.mapped_ingredient_id<>v_g.id)
  OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r
    WHERE r.purchase_invoice_line_id=v_l.id)
  OR EXISTS(SELECT 1 FROM public.stock_movements sm
    WHERE sm.reference_id=v_l.id AND sm.movement_type='PURCHASE')
 THEN RETURN jsonb_build_object('ok',false,'reason','current_invoice_line_or_receipt_conflicted'); END IF;
 IF EXISTS(SELECT 1 FROM private.purchase_verified_supplier_dimension_identity seen
   WHERE seen.invoice_line_id=v_l.id AND seen.ingredient_id=v_g.id) THEN
  RETURN jsonb_build_object('ok',true,'idempotent',true,
   'ingredient_id',v_g.id,'stock_changed',false,'status_retained',true); END IF;
 IF v_l.mapped_ingredient_id IS NOT NULL
 THEN RETURN jsonb_build_object('ok',false,'reason','ingredient_already_linked_without_size_audit'); END IF;

 SELECT * INTO v_p FROM public.purchase_interpretation_proposals
  WHERE id=v_l.interpretation_proposal_id FOR KEY SHARE;
 SELECT * INTO v_e FROM public.document_extractions
  WHERE id=v_p.document_extraction_id FOR KEY SHARE;
 SELECT * INTO v_mail FROM public.purchase_email_documents
  WHERE invoice_id=v_i.id FOR KEY SHARE;
 SELECT * INTO v_job FROM public.document_processing_jobs
  WHERE invoice_id=v_i.id FOR KEY SHARE;
 IF v_p.id IS NULL OR v_e.id IS NULL OR v_mail.id IS NULL OR v_job.id IS NULL
  OR v_p.purchase_invoice_id<>v_i.id OR v_p.supplier_id<>9
  OR v_p.source_file_hash<>v_i.content_sha256
  OR v_p.source_item_name<>v_l.original_name
  OR v_p.normalizer_version<>'mistral-pipeline-v3'
  OR v_p.status<>'needs_mapping'
  OR v_p.ingredient_id IS NOT NULL OR v_p.mapping_version_id IS NOT NULL
  OR v_p.review_reasons<>ARRAY['producto_sin_mapping']::text[]
  OR cardinality(v_p.warnings)<>0
  OR v_p.provenance->>'source'<>'mistral_canonical'
  OR v_p.provenance->>'trigger'<>'mistral_job_completion'
  OR v_p.provenance->>'schema_version'<>'mistral-pipeline-v3'
  OR v_p.provenance ? 'revision'
  OR v_p.observed->>'supplier_product_code_raw'<>'BV1011'
  OR v_p.observed->>'description_raw'<>v_l.original_name
  OR v_p.observed->>'billing_unit_raw' IS NOT NULL
  OR v_p.source_row_index IS NULL OR v_p.source_row_index<0
  OR v_e.status<>'success' OR v_e.invoice_id<>v_i.id
  OR v_e.file_version_hash<>v_i.content_sha256
  OR v_e.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
  OR v_e.raw_json_artifact->>'extractor'<>'mistral'
  OR v_mail.status<>'imported' OR v_mail.supplier_id<>9
  OR v_mail.content_sha256<>v_i.content_sha256
  OR v_mail.storage_path<>v_i.file_path
  OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses addr
    WHERE addr.supplier_id=9 AND addr.confirmed_by_owner
     AND lower(addr.sender_email)=lower(v_mail.sender_email))
  OR v_job.status<>'completed' OR v_job.evidence_extraction_id<>v_e.id
  OR v_job.file_version_hash<>v_i.content_sha256
  OR EXISTS(SELECT 1 FROM public.purchase_mapping_versions bad
    WHERE bad.supplier_id=9 AND bad.status='confirmed'
      AND bad.supplier_item_name=v_l.original_name AND bad.ingredient_id<>v_g.id)
 THEN RETURN jsonb_build_object('ok',false,'reason','pdf_sender_sku_or_mapping_conflicted'); END IF;
 IF v_p.source_row_index>=jsonb_array_length(v_e.raw_json_artifact->'canonical'->'lines')
 THEN RETURN jsonb_build_object('ok',false,'reason','canonical_line_missing'); END IF;
 v_row:=v_e.raw_json_artifact->'canonical'->'lines'->v_p.source_row_index;
 IF v_row->>'description_raw'<>v_l.original_name
  OR v_row->>'supplier_product_code_raw'<>'BV1011'
  OR v_p.source_table_index IS DISTINCT FROM (v_row->>'page_index')::integer
  OR replace(v_row->>'quantity_raw',',','.')::numeric<>v_l.quantity
  OR replace(v_row->>'line_total_raw',',','.')::numeric<>v_l.total_price
  OR replace(v_row->>'unit_price_raw',',','.')::numeric<>v_l.unit_price
  OR abs(v_l.quantity*v_l.unit_price-v_l.total_price)>
     (v_l.quantity*0.005+0.0051)
 THEN RETURN jsonb_build_object('ok',false,'reason','original_invoice_line_financials_not_verified'); END IF;

 IF p_preview THEN RETURN jsonb_build_object('ok',true,'eligible',true,
   'ingredient_id',v_g.id,'ingredient_name',v_g.name,
   'size','S','observed_dimensions_mm',jsonb_build_array(140,190),
   'nominal_dimensions_mm',jsonb_build_array(150,200),
   'size_difference_mm',jsonb_build_array(10,10),'units_per_case',1000,
   'quantity_approval',false,'invoice_review_retained',true,
   'stock_changed',false); END IF;

 INSERT INTO private.purchase_verified_supplier_dimension_identity
   (invoice_line_id,invoice_id,ingredient_id,source_sha256,supplier_sku,
    measured_short_mm,measured_long_mm,nominal_short_mm,nominal_long_mm,units_per_case)
 VALUES(v_l.id,v_i.id,v_g.id,v_i.content_sha256,'BV1011',140,190,150,200,1000);
 UPDATE public.purchase_invoice_lines
 SET mapped_ingredient_id=v_g.id
 WHERE id=v_l.id AND status='pending' AND mapped_ingredient_id IS NULL
  AND interpretation_proposal_id=v_p.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sanilec invoice changed concurrently'; END IF;
 INSERT INTO private.purchase_verified_identity_learning
  (invoice_line_id,invoice_id,ingredient_id,source_sha256,provenance)
 VALUES(v_l.id,v_i.id,v_g.id,v_i.content_sha256,
  'supplier_BV1011_nearest_owner_employee_measured_small_14x19_vs_15x20_v1');
 RETURN jsonb_build_object('ok',true,'applied',true,
  'ingredient_id',v_g.id,'size','S','units_per_case',1000,
  'invoice_review_retained',true,'stock_changed',false,
  'physical_receipt_unconfirmed',true);
END;
$f$;
REVOKE ALL ON FUNCTION public.learn_verified_sanilec_vacuum_bag_small_v1(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.learn_verified_sanilec_vacuum_bag_small_v1(uuid,boolean)
 TO service_role;
