-- Solo la segunda versión canónica, ajustada a la precisión de K4,
-- puede activar el delegado económico automático.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_interpretation_proposals_mistral_v3_row_uidx
  ON public.purchase_interpretation_proposals (document_extraction_id, source_row_index)
  WHERE normalizer_version = 'mistral-pipeline-v3' AND source_row_index IS NOT NULL;
-- Corrige el tipo real text[] de las razones y advertencias K5.
-- Amplía el delegado existente a propuestas Mistral verificables. K4 conserva
-- todas las comprobaciones y sigue siendo el único escritor económico.
CREATE OR REPLACE FUNCTION public.apply_receipt_line_automated(
  p_invoice_line_id uuid,
  p_mapping_version_id uuid,
  p_allocations jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_dry_run boolean DEFAULT false,
  p_interpretation_proposal_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_proposal public.purchase_interpretation_proposals%ROWTYPE;
  v_actor_id uuid;
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
  IF v_proposal.provenance ? 'revision'
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

  v_actor_id := v_proposal.created_by;
  IF v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_actor_id
      AND p.role IN ('manager', 'admin')
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'forbidden',
      'message', 'La propuesta no tiene un manager o admin válido como actor de auditoría.'
    );
  END IF;

  -- apply_receipt_line conserva todas sus validaciones actuales. Solo durante
  -- esta transacción, auth.uid() representa al manager/admin que originó la
  -- propuesta automática, de modo que confirmaciones, ledger e histórico de
  -- precio mantienen actor_profile_id y changed_by válidos.
  PERFORM set_config('request.jwt.claim.sub', v_actor_id::text, true);

  v_result := public.apply_receipt_line(
    p_invoice_line_id,
    p_mapping_version_id,
    p_allocations,
    p_idempotency_key,
    p_dry_run,
    p_interpretation_proposal_id
  );

  RETURN v_result || jsonb_build_object(
    'automated', true,
    'automation_actor_profile_id', v_actor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_receipt_line_automated(uuid, uuid, jsonb, text, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_receipt_line_automated(uuid, uuid, jsonb, text, boolean, uuid)
  TO service_role;

COMMENT ON FUNCTION public.apply_receipt_line_automated(uuid, uuid, jsonb, text, boolean, uuid) IS
  'Delegado de recepción automática para evidencia Docling o Mistral verificable. K4 sigue siendo el único escritor económico.';
