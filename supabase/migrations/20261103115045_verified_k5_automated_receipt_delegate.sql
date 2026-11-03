-- Service-only K4 delegate for strictly validated Mistral append-only
-- automatic K5 revisions. Original delegate remains unchanged.
CREATE OR REPLACE FUNCTION public.apply_receipt_line_automated_v2(p_invoice_line_id uuid, p_mapping_version_id uuid, p_allocations jsonb DEFAULT '[]'::jsonb, p_idempotency_key text DEFAULT NULL::text, p_dry_run boolean DEFAULT false, p_interpretation_proposal_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_proposal public.purchase_interpretation_proposals%ROWTYPE;
  v_actor_id uuid;
  v_captured_by_id uuid;
  v_invoice_created_by uuid;
  v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'forbidden',
      'message', 'La confirmación automática solo puede ejecutarse desde el servicio interno.'
    );
  END IF;

  IF p_interpretation_proposal_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'needs_review',
      'message', 'La confirmación automática exige una propuesta K5 explícita.'
    );
  END IF;

  SELECT * INTO v_proposal
  FROM public.purchase_interpretation_proposals
  WHERE id = p_interpretation_proposal_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'needs_review',
      'message', 'La propuesta K5 automática no existe.'
    );
  END IF;

  -- Mantener el origen Docling y aceptar solo evidencia Mistral versionada.
  -- Ninguna revisión humana entra por el delegado automático.
  IF (v_proposal.provenance ? 'revision'
      AND NOT EXISTS(
        SELECT 1 FROM public.purchase_interpretation_proposals original
        JOIN public.purchase_mapping_versions m ON m.id=v_proposal.mapping_version_id
        WHERE original.id=v_proposal.supersedes_proposal_id
          AND original.status='needs_mapping'
          AND original.mapping_version_id IS NULL AND original.ingredient_id IS NULL
          AND original.review_reasons=ARRAY['producto_sin_mapping']::text[]
          AND cardinality(original.warnings)=0
          AND original.purchase_invoice_id=v_proposal.purchase_invoice_id
          AND original.document_extraction_id=v_proposal.document_extraction_id
          AND original.source_file_hash=v_proposal.source_file_hash
          AND original.proposal_set_id=v_proposal.proposal_set_id
          AND original.source_item_name=v_proposal.source_item_name
          AND original.observed=v_proposal.observed
          AND original.line_quantity=v_proposal.line_quantity
          AND original.line_total=v_proposal.line_total
          AND original.observed_unit_price=v_proposal.observed_unit_price
          AND original.provenance->>'source'='mistral_canonical'
          AND original.provenance->>'trigger'='mistral_job_completion'
          AND original.provenance->>'economic_effects'='false'
          AND NOT(original.provenance ? 'revision')
          AND v_proposal.provenance->'revision'->>'kind'='verified_grouped_delivery'
          AND v_proposal.provenance->'revision'->>'parent_id'=original.id::text
          AND v_proposal.provenance->'revision'->>'stock_changed'='false'
          AND v_proposal.status='ready_for_review'
          AND cardinality(v_proposal.review_reasons)=0
          AND cardinality(v_proposal.warnings)=0
          AND m.status='confirmed'
          AND m.supplier_id=v_proposal.supplier_id
          AND m.ingredient_id=v_proposal.ingredient_id
          AND m.confirmed_by=v_proposal.created_by
          AND m.source_document_extraction_id=v_proposal.document_extraction_id
          AND m.supplier_item_name=v_proposal.source_item_name
          AND m.idempotency_key LIKE 'verified-grouped-k5-v1:%'
          AND EXISTS (
             SELECT 1 FROM public.purchase_invoice_lines line
             WHERE line.interpretation_proposal_id=v_proposal.id
             AND line.id::text=split_part(m.idempotency_key,':',2)
             AND line.invoice_id=v_proposal.purchase_invoice_id
             AND line.mapped_ingredient_id=v_proposal.ingredient_id
             AND line.status='mapped'
          )
      ))
     OR NOT (
       (v_proposal.provenance->>'source' = 'docling_evidence'
        AND v_proposal.provenance->>'trigger' = 'docling_completion')
       OR
       (v_proposal.provenance->>'source' = 'mistral_canonical'
        AND v_proposal.provenance->>'trigger' = 'mistral_job_completion'
        AND v_proposal.provenance->>'schema_version' = 'mistral-pipeline-v3'
        AND v_proposal.provenance->>'economic_effects' = 'false'
        AND v_proposal.normalizer_version = 'mistral-pipeline-v3'
        AND cardinality(v_proposal.review_reasons) = 0
        AND cardinality(v_proposal.warnings) = 0
        AND EXISTS (
          SELECT 1 FROM public.document_extractions e
          WHERE e.id = v_proposal.document_extraction_id
            AND e.invoice_id = v_proposal.purchase_invoice_id
            AND e.file_version_hash = v_proposal.source_file_hash
            AND e.extractor_version = 'mistral-ocr-4-1-document-observation-v2'
            AND e.status = 'success'
            AND e.raw_json_artifact->>'extractor' = 'mistral'
            AND e.raw_json_artifact->>'model' = 'mistral-ocr-4-1'
        ))
     ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'needs_review',
      'message', 'Esta propuesta requiere intervención humana antes de confirmar.'
    );
  END IF;

  SELECT i.created_by INTO v_invoice_created_by
  FROM public.purchase_invoices i
  WHERE i.id = v_proposal.purchase_invoice_id;

  v_captured_by_id := v_proposal.created_by;
  IF v_captured_by_id IS NULL
     OR v_captured_by_id IS DISTINCT FROM v_invoice_created_by THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'forbidden',
      'message', 'La propuesta no conserva la identidad de quien capturó el albarán.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_captured_by_id AND p.role IN ('manager', 'admin')
  ) THEN
    v_actor_id := v_captured_by_id;
  ELSIF v_proposal.provenance->>'source' = 'mistral_canonical'
     AND EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = v_captured_by_id AND p.role = 'supervisor'
     ) THEN
    SELECT a.profile_id INTO v_actor_id
    FROM private.purchase_receipt_automation_actor a
    JOIN public.profiles p ON p.id = a.profile_id
    JOIN auth.users u ON u.id = a.profile_id
    WHERE a.singleton = true
      AND p.role IN ('manager', 'admin')
      AND p.visible_in_plantilla = false
      AND u.email = 'marbella-purchase-automation@marbella.invalid'
      AND u.email_confirmed_at IS NULL
      AND u.raw_app_meta_data->>'marbella_automation_actor' = 'purchase_receipt_v1';
  END IF;

  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'forbidden',
      'message', 'La propuesta no tiene un actor económico autorizado.'
    );
  END IF;

  -- apply_receipt_line conserva todas sus validaciones actuales. Solo durante
  -- esta transacción, auth.uid() representa al actor económico autorizado;
  -- la persona capturadora queda enlazada en el registro privado de auditoría.
  PERFORM set_config('request.jwt.claim.sub', v_actor_id::text, true);

  v_result := public.apply_receipt_line(
    p_invoice_line_id,
    p_mapping_version_id,
    p_allocations,
    p_idempotency_key,
    p_dry_run,
    p_interpretation_proposal_id
  );

  IF COALESCE((v_result->>'ok')::boolean, false) IS TRUE
     AND NOT p_dry_run
     AND COALESCE((v_result->>'idempotent')::boolean, false) IS FALSE THEN
    INSERT INTO private.purchase_receipt_automation_audit (
      receipt_confirmation_id, interpretation_proposal_id,
      automation_actor_profile_id, captured_by_profile_id
    ) VALUES (
      (v_result->>'confirmation_id')::uuid, v_proposal.id,
      v_actor_id, v_captured_by_id
    );
  END IF;

  RETURN v_result || jsonb_build_object(
    'automated', true,
    'automation_actor_profile_id', v_actor_id,
    'captured_by_profile_id', v_captured_by_id
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_receipt_line_automated_v2(uuid,uuid,jsonb,text,boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_receipt_line_automated_v2(uuid,uuid,jsonb,text,boolean,uuid) TO service_role;
