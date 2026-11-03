-- Confirm a Mistral-created alias only when its cryptographic origin is a
-- CURRENT supplier-confirmed physical presentation. No stock/economic writes.
CREATE OR REPLACE FUNCTION public.confirm_verified_mistral_alias_mapping(
 p_version_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE
 v public.purchase_mapping_versions%ROWTYPE;
 src public.purchase_mapping_versions%ROWTYPE;
 prop public.purchase_interpretation_proposals%ROWTYPE;
 inv public.purchase_invoices%ROWTYPE;
 line public.purchase_invoice_lines%ROWTYPE;
 e public.document_extractions%ROWTYPE;
 actor_id uuid;
 v_expected text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
   RETURN jsonb_build_object('ok',false,'reason','service_role_only');
 END IF;
 SELECT * INTO v FROM public.purchase_mapping_versions WHERE id=p_version_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','mapping_not_found'); END IF;
 IF v.status='confirmed' THEN
   RETURN jsonb_build_object('ok',true,'already_confirmed',true,'applied',false);
 END IF;
 IF v.status<>'proposed' OR v.idempotency_key IS NULL
 THEN RETURN jsonb_build_object('ok',false,'reason','not_a_pending_mistral_alias'); END IF;
 SELECT * INTO prop FROM public.purchase_interpretation_proposals p
 WHERE p.mapping_version_id=v.id
 AND p.status='ready_for_review'
 AND cardinality(p.review_reasons)=0 AND cardinality(p.warnings)=0
 AND p.provenance->>'source'='mistral_canonical'
 AND p.provenance->>'trigger'='mistral_job_completion'
 AND p.provenance->>'schema_version'='mistral-pipeline-v3'
 AND p.provenance->>'economic_effects'='false'
 AND NOT p.provenance?'revision'
 AND p.interpreted->>'match_source'='code'
 AND (p.interpreted->>'match_score')::numeric>=0.95
 AND p.interpreted->>'alias_source_mapping_version_id' IS NOT NULL
 ORDER BY p.id LIMIT 1;
 IF prop.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','no_trusted_mistral_proposal'); END IF;
 SELECT * INTO src FROM public.purchase_mapping_versions
 WHERE id=(prop.interpreted->>'alias_source_mapping_version_id')::uuid FOR KEY SHARE;
 SELECT * INTO inv FROM public.purchase_invoices WHERE id=prop.purchase_invoice_id;
 SELECT * INTO line FROM public.purchase_invoice_lines
 WHERE interpretation_proposal_id=prop.id AND invoice_id=inv.id
   AND superseded_by_extraction_id IS NULL;
 SELECT * INTO e FROM public.document_extractions WHERE id=prop.document_extraction_id;
 IF src.id IS NULL OR src.status<>'confirmed' OR inv.id IS NULL OR line.id IS NULL
   OR e.id IS NULL OR inv.status NOT IN ('mapped','pending_mapping')
   OR inv.duplicate_of_invoice_id IS NOT NULL OR inv.supplier_id IS NULL
   OR src.supplier_id<>inv.supplier_id OR v.supplier_id<>src.supplier_id
   OR src.ingredient_id IS DISTINCT FROM v.ingredient_id
   OR line.mapped_ingredient_id IS DISTINCT FROM v.ingredient_id
   OR prop.ingredient_id IS DISTINCT FROM v.ingredient_id
   OR prop.supplier_id<>v.supplier_id
   OR v.conversion_factor IS DISTINCT FROM src.conversion_factor
   OR v.line_content_qty IS DISTINCT FROM src.line_content_qty
   OR lower(btrim(v.line_content_unit)) IS DISTINCT FROM lower(btrim(src.line_content_unit))
   OR lower(btrim(v.line_billing_unit)) IS DISTINCT FROM lower(btrim(src.line_billing_unit))
   OR v.supplier_item_name IS DISTINCT FROM prop.source_item_name
   OR v.source_document_extraction_id IS DISTINCT FROM e.id
   OR prop.source_file_hash IS DISTINCT FROM inv.content_sha256
   OR e.invoice_id<>inv.id OR e.file_version_hash<>inv.content_sha256
   OR e.status<>'success' OR e.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
   OR e.raw_json_artifact->>'extractor'<>'mistral'
   OR e.raw_json_artifact->>'model'<>'mistral-ocr-4-1'
   OR prop.line_quantity IS DISTINCT FROM line.quantity
   OR abs(prop.line_total-line.total_price)>0.011
   OR prop.physical_quantity IS NULL OR prop.physical_quantity<=0
   OR EXISTS (
     SELECT 1 FROM public.purchase_mapping_versions m
     WHERE m.supersedes_id=src.id AND m.status='confirmed'
   )
   OR EXISTS(
     SELECT 1 FROM public.purchase_mapping_versions m
     WHERE m.id<>v.id AND m.status='confirmed' AND m.supplier_id=v.supplier_id
       AND lower(btrim(m.supplier_item_name))=lower(btrim(v.supplier_item_name))
       AND (m.ingredient_id IS DISTINCT FROM v.ingredient_id
        OR m.conversion_factor IS DISTINCT FROM v.conversion_factor)
   )
 THEN RETURN jsonb_build_object('ok',false,'reason','source_alias_or_physical_presentation_mismatch'); END IF;
 v_expected:='mistral-alias-v1:'||src.id::text||':'||
   encode(extensions.digest(to_json(prop.source_item_name)::text,'sha256'),'hex');
 IF v.idempotency_key IS DISTINCT FROM v_expected
 THEN RETURN jsonb_build_object('ok',false,'reason','alias_origin_signature_invalid'); END IF;
 SELECT a.profile_id INTO actor_id
 FROM private.purchase_receipt_automation_actor a
 JOIN public.profiles p ON p.id=a.profile_id
 JOIN auth.users u ON u.id=a.profile_id
 WHERE a.singleton=true AND p.role IN ('manager','admin') AND p.visible_in_plantilla=false
 AND u.email='marbella-purchase-automation@marbella.invalid'
 AND u.raw_app_meta_data->>'marbella_automation_actor'='purchase_receipt_v1';
 IF actor_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','automation_actor_unavailable'); END IF;
 IF p_preview THEN RETURN jsonb_build_object('ok',true,'eligible',true,'applied',false,'version_id',v.id,'stock_changed',false); END IF;
 UPDATE public.purchase_mapping_versions
 SET status='confirmed',confirmed_at=now(),confirmed_by=actor_id,
 note=concat_ws(' | ',nullif(note,''),'Alias de OCR confirmado automáticamente contra presentación histórica verificada')
 WHERE id=v.id AND status='proposed';
 IF NOT FOUND THEN RAISE EXCEPTION 'Alias mapping changed concurrently'; END IF;
 RETURN jsonb_build_object('ok',true,'applied',true,'version_id',v.id,'stock_changed',false);
END
$body$;
REVOKE ALL ON FUNCTION public.confirm_verified_mistral_alias_mapping(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_verified_mistral_alias_mapping(uuid,boolean) TO service_role;
