-- K5/K4: permite que el pipeline documental auto-confirme únicamente a través
-- del comando económico canónico. Esta función NO escribe stock, precios ni
-- recepciones: valida el contexto de automatización, fija el actor humano de
-- auditoría durante la transacción y delega íntegramente en apply_receipt_line.

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

  -- El servicio no puede auto-confirmar revisiones manuales ni propuestas
  -- fabricadas por otra vía. Solo hechos nacidos del completion de Docling.
  IF COALESCE(v_proposal.provenance->>'source', '') <> 'docling_evidence'
     OR COALESCE(v_proposal.provenance->>'trigger', '') <> 'docling_completion'
     OR v_proposal.provenance ? 'revision' THEN
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
  'Service-role-only delegate for deterministic K5 auto-confirmation. All economic writes remain inside public.apply_receipt_line/private.apply_receipt_line.';
