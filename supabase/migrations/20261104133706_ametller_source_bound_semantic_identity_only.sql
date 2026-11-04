-- Ametller: the same supplier item / ingredient was owner-confirmed,
-- but its historic purchase mapping incorrectly assumes kilograms while the
-- verified original invoices bill a MANOJO. Learn *ingredient identity only*,
-- NEVER 1 MAN = 1 kg, and do not confirm stock or invoice review status.
CREATE TABLE IF NOT EXISTS private.purchase_verified_ingredient_unit_holds (
  invoice_line_id uuid PRIMARY KEY REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  confirmed_mapping_version_id uuid NOT NULL REFERENCES public.purchase_mapping_versions(id) ON DELETE RESTRICT,
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  supplier_sku text NOT NULL,
  invoice_billing_unit text NOT NULL,
  historical_billing_unit text NOT NULL,
  source_quantity numeric NOT NULL CHECK(source_quantity>0),
  source_net_amount numeric NOT NULL CHECK(source_net_amount>=0),
  requires_physical_unit_confirmation boolean NOT NULL DEFAULT true
    CHECK(requires_physical_unit_confirmation=true),
  stock_changed boolean NOT NULL DEFAULT false CHECK(stock_changed=false),
  rule_version text NOT NULL DEFAULT 'ametller_owner_exact_identity_unknown_manojo_mass_v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_conflict_must_remain_disclosed CHECK (
    lower(trim(invoice_billing_unit))<>lower(trim(historical_billing_unit)))
);
ALTER TABLE private.purchase_verified_ingredient_unit_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_verified_ingredient_unit_holds FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_verified_ingredient_unit_holds TO service_role;

CREATE OR REPLACE FUNCTION public.learn_verified_ametller_unquantified_manojo_v1(
 p_invoice_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
  v_base jsonb;
  v_i public.purchase_invoices%ROWTYPE;
  v_l public.purchase_invoice_lines%ROWTYPE;
  v_p public.purchase_interpretation_proposals%ROWTYPE;
  v_e public.document_extractions%ROWTYPE;
  v_m public.purchase_mapping_versions%ROWTYPE;
  v_g public.ingredients%ROWTYPE;
  v_row jsonb;
  v_other_confirmed integer;
  v_eligible integer:=0;
  v_items jsonb:='[]'::jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_invoice_id IS NULL
 THEN RETURN jsonb_build_object('ok',false,'reason','service_role_only'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('am_verified_mapping:'||p_invoice_id::text,0));
 SELECT * INTO v_i FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF v_i.id IS NULL OR v_i.supplier_id<>1 OR v_i.source<>'email'
  OR v_i.document_kind<>'monthly_invoice' OR v_i.status<>'pending_mapping'
  OR v_i.duplicate_of_invoice_id IS NOT NULL
 THEN RETURN jsonb_build_object('ok',false,'reason','not_pending_verified_ametller_invoice'); END IF;
 v_base:=public.approve_verified_ametller_mappings_v1(p_invoice_id,true);
 IF v_base->>'ok'<>'true' OR v_base->>'stock_changed'<>'false'
 THEN RETURN jsonb_build_object('ok',false,'reason','original_pdf_sender_or_economics_not_verified'); END IF;
 SELECT * INTO v_e FROM public.document_extractions
 WHERE invoice_id=p_invoice_id AND status='success' FOR KEY SHARE;
 SELECT * INTO v_m FROM public.purchase_mapping_versions
 WHERE supplier_id=1 AND supplier_item_name='Albahaca Manojo'
  AND status='confirmed' AND confirmed_by IS NOT NULL
 ORDER BY confirmed_at DESC LIMIT 1;
 SELECT * INTO v_g FROM public.ingredients WHERE id=v_m.ingredient_id FOR KEY SHARE;
 SELECT count(DISTINCT ingredient_id) INTO v_other_confirmed
 FROM public.purchase_mapping_versions
 WHERE supplier_id=1 AND status='confirmed'
  AND lower(trim(supplier_item_name))='albahaca manojo';
 IF v_m.id IS NULL OR v_g.id IS NULL OR v_g.name<>'Albahaca'
  OR v_g.archived_at IS NOT NULL OR v_g.base_unit<>'g' OR v_g.purchase_unit<>'kg'
  OR v_m.line_billing_unit<>'kg' OR v_m.line_content_unit<>'kg'
  OR v_m.line_content_qty<>1 OR v_m.conversion_factor<>1
  OR v_other_confirmed<>1
  OR EXISTS(SELECT 1 FROM public.purchase_mapping_versions newer
   WHERE newer.supplier_id=1 AND newer.status='confirmed'
     AND newer.supplier_item_name=v_m.supplier_item_name AND newer.confirmed_at>v_m.confirmed_at)
 THEN RETURN jsonb_build_object('ok',false,'reason','owner_confirmation_or_unit_conflict_not_unique'); END IF;
 FOR v_l IN SELECT * FROM public.purchase_invoice_lines
 WHERE invoice_id=p_invoice_id AND status='pending' AND mapped_ingredient_id IS NULL
 AND superseded_by_extraction_id IS NULL AND original_name='Albahaca Manojo'
 AND line_unit='MAN'
 ORDER BY id FOR UPDATE
 LOOP
  SELECT * INTO v_p FROM public.purchase_interpretation_proposals
  WHERE id=v_l.interpretation_proposal_id FOR KEY SHARE;
  v_row:=v_e.raw_json_artifact->'canonical'->'lines'->v_p.source_row_index;
  IF v_p.id IS NULL OR v_e.id IS NULL OR v_p.purchase_invoice_id<>v_i.id
   OR v_p.document_extraction_id<>v_e.id
   OR v_p.source_file_hash<>v_i.content_sha256
   OR v_p.supplier_id<>1
   OR v_p.normalizer_version<>'ametller-pdf-text-v1'
   OR v_p.status<>'needs_mapping' OR v_p.ingredient_id IS NOT NULL
   OR v_p.mapping_version_id IS NOT NULL
   OR v_p.review_reasons<>ARRAY['producto_sin_mapping']::text[]
   OR cardinality(v_p.warnings)<>0
   OR v_p.provenance->>'source'<>'pdf_text_verified'
   OR v_p.provenance->>'original_source_sha'<>v_i.content_sha256
   OR v_p.provenance ? 'revision'
   OR v_p.observed->>'supplier_product_code_raw'<>'16190'
   OR v_p.observed->>'description_raw'<>'Albahaca Manojo'
   OR v_p.observed->>'billing_unit_raw'<>'MAN'
   OR v_p.source_row_index IS NULL OR v_p.source_row_index<0
   OR v_p.source_table_index IS DISTINCT FROM (v_row->>'page_index')::integer
   OR v_row IS NULL OR v_row->>'description_raw'<>'Albahaca Manojo'
   OR v_row->>'supplier_product_code_raw'<>'16190'
   OR v_row->>'billing_unit_raw'<>'MAN'
   OR (v_row->>'quantity_raw')::numeric<>v_l.quantity
   OR (v_row->>'line_total_raw')::numeric<>v_l.total_price
   OR v_p.line_quantity<>v_l.quantity OR v_p.line_total<>v_l.total_price
   OR v_l.quantity<=0 OR v_l.total_price<=0
   OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r
      WHERE r.purchase_invoice_line_id=v_l.id)
   OR EXISTS(SELECT 1 FROM public.stock_movements sm
      WHERE sm.reference_id=v_l.id OR sm.reference_doc='ALB-LINE-'||v_l.id::text)
  THEN RETURN jsonb_build_object('ok',false,'reason','source_line_or_prior_stock_not_verified'); END IF;
  v_eligible:=v_eligible+1;
  v_items:=v_items||jsonb_build_array(jsonb_build_object('line_id',v_l.id,
   'ingredient_id',v_g.id,'confirmed_mapping_version_id',v_m.id,
   'source_unit','MAN','historic_unit','kg','physical_quantity_unknown',true));
  IF NOT p_preview THEN
    INSERT INTO private.purchase_verified_ingredient_unit_holds
      (invoice_line_id,invoice_id,ingredient_id,confirmed_mapping_version_id,
       source_sha256,supplier_sku,invoice_billing_unit,historical_billing_unit,
       source_quantity,source_net_amount)
    VALUES(v_l.id,v_i.id,v_g.id,v_m.id,v_i.content_sha256,'16190','MAN','kg',
       v_l.quantity,v_l.total_price);
    UPDATE public.purchase_invoice_lines
     SET mapped_ingredient_id=v_g.id
     WHERE id=v_l.id AND mapped_ingredient_id IS NULL AND status='pending'
       AND interpretation_proposal_id=v_p.id AND superseded_by_extraction_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent source line edit; rollback'; END IF;
    INSERT INTO private.purchase_verified_identity_learning
      (invoice_line_id,invoice_id,ingredient_id,source_sha256,provenance)
    VALUES(v_l.id,v_i.id,v_g.id,v_i.content_sha256,
       'owner_confirmed_exact_supplier_identity_only_1_MAN_mass_unknown_v1');
  END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'applied',NOT p_preview,
  'eligible_lines',v_eligible,'identity_only',true,'physical_quantity_known',false,
  'pending_status_retained',true,'stock_changed',false,'invoice_completed',false,
  'rule_version','ametller_owner_exact_identity_unknown_manojo_mass_v1',
  'items',v_items);
END;
$f$;
REVOKE ALL ON FUNCTION public.learn_verified_ametller_unquantified_manojo_v1(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.learn_verified_ametller_unquantified_manojo_v1(uuid,boolean)
 TO service_role;
