-- El único actor económico técnico autorizado reside fuera de la Data API.
-- Se provisiona por la API administrativa de Auth; no se fija ningún UUID generado.
CREATE TABLE private.purchase_receipt_automation_actor (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  configured_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.purchase_receipt_automation_actor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.purchase_receipt_automation_actor FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM auth.users
      WHERE email = 'marbella-purchase-automation@marbella.invalid'
        AND raw_app_meta_data->>'marbella_automation_actor' = 'purchase_receipt_v1') <> 1 THEN
    RAISE EXCEPTION 'El actor técnico de compras no está provisionado de forma única.';
  END IF;

  INSERT INTO private.purchase_receipt_automation_actor (profile_id)
  SELECT p.id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email = 'marbella-purchase-automation@marbella.invalid'
    AND u.raw_app_meta_data->>'marbella_automation_actor' = 'purchase_receipt_v1'
    AND u.email_confirmed_at IS NULL
    AND p.role = 'manager'
    AND p.visible_in_plantilla = false;

  IF (SELECT count(*) FROM private.purchase_receipt_automation_actor) <> 1 THEN
    RAISE EXCEPTION 'El perfil del actor técnico no cumple las condiciones de seguridad.';
  END IF;
END;
$$;

-- Registro append-only del actor económico y de la persona que capturó el papel.
CREATE TABLE private.purchase_receipt_automation_audit (
  receipt_confirmation_id uuid PRIMARY KEY REFERENCES public.purchase_receipt_confirmations(id) ON DELETE RESTRICT,
  interpretation_proposal_id uuid NOT NULL UNIQUE REFERENCES public.purchase_interpretation_proposals(id) ON DELETE RESTRICT,
  automation_actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  captured_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.purchase_receipt_automation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.purchase_receipt_automation_audit FROM PUBLIC, anon, authenticated;

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
$$;

REVOKE ALL ON FUNCTION public.apply_receipt_line_automated(uuid, uuid, jsonb, text, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_receipt_line_automated(uuid, uuid, jsonb, text, boolean, uuid)
  TO service_role;

COMMENT ON FUNCTION public.apply_receipt_line_automated(uuid, uuid, jsonb, text, boolean, uuid) IS
  'Delegado de recepción automática: el supervisor conserva la captura, una cuenta técnica manager/admin asume K4 y un registro privado enlaza ambos actores.';
