-- K5: cierre de dos bordes de compatibilidad con K4:
--   1) un reintento con la misma idempotency key devuelve la confirmación ya
--      enlazada a la misma propuesta;
--   2) una línea materializada por K5 no puede saltarse K5 llamando a la firma
--      histórica de cinco argumentos (proposal_id NULL).

CREATE OR REPLACE FUNCTION private.apply_receipt_line_with_proposal_idempotent(
  p_invoice_line_id uuid,
  p_mapping_version_id uuid,
  p_allocations jsonb,
  p_idempotency_key text,
  p_dry_run boolean DEFAULT false,
  p_interpretation_proposal_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.purchase_receipt_confirmations%ROWTYPE;
  v_link public.purchase_receipt_interpretation_links%ROWTYPE;
  v_proposal public.purchase_interpretation_proposals%ROWTYPE;
  v_line_proposal_id uuid;
  v_result jsonb;
BEGIN
  IF p_interpretation_proposal_id IS NULL THEN
    SELECT interpretation_proposal_id INTO v_line_proposal_id
    FROM public.purchase_invoice_lines
    WHERE id = p_invoice_line_id;

    IF FOUND AND v_line_proposal_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'needs_review',
        'message', 'Esta línea procede de K5 y debe confirmarse con su propuesta de interpretación explícita.'
      );
    END IF;

    -- Compatibilidad real con K4: las líneas históricas que nunca nacieron de
    -- K5 continúan funcionando con los cinco argumentos anteriores.
    RETURN private.apply_receipt_line_with_proposal(
      p_invoice_line_id,
      p_mapping_version_id,
      p_allocations,
      p_idempotency_key,
      p_dry_run,
      NULL
    );
  END IF;

  -- Solo intercepta el caso realmente idempotente: misma key + misma línea.
  -- Se hace antes de invalidar revisiones antiguas para que un retry de una
  -- recepción YA confirmada reproduzca siempre el mismo resultado histórico.
  SELECT * INTO v_existing
  FROM public.purchase_receipt_confirmations
  WHERE idempotency_key = trim(COALESCE(p_idempotency_key, ''));

  IF FOUND AND v_existing.purchase_invoice_line_id = p_invoice_line_id THEN
    SELECT * INTO v_link
    FROM public.purchase_receipt_interpretation_links
    WHERE receipt_confirmation_id = v_existing.id;

    IF NOT FOUND
       OR v_link.interpretation_proposal_id IS DISTINCT FROM p_interpretation_proposal_id THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'idempotency_conflict',
        'message', 'La recepción existente no está enlazada a esta propuesta K5.'
      );
    END IF;

    -- K4 conserva la autoridad sobre la respuesta/idempotencia. Esta llamada
    -- no produce escrituras: K4 detecta la confirmación existente y retorna.
    v_result := private.apply_receipt_line(
      p_invoice_line_id,
      p_mapping_version_id,
      p_allocations,
      p_idempotency_key,
      p_dry_run
    );

    RETURN v_result || jsonb_build_object(
      'interpretation_proposal_id', p_interpretation_proposal_id,
      'proposal_validated', true
    );
  END IF;

  SELECT * INTO v_proposal
  FROM public.purchase_interpretation_proposals
  WHERE id = p_interpretation_proposal_id;

  IF FOUND AND EXISTS (
    SELECT 1
    FROM public.purchase_interpretation_proposals newer
    WHERE newer.purchase_invoice_id = v_proposal.purchase_invoice_id
      AND newer.proposal_set_id IS DISTINCT FROM v_proposal.proposal_set_id
      AND NOT (newer.provenance ? 'revision')
      AND newer.created_at > v_proposal.created_at
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'needs_review',
      'message', 'Existe un recálculo K5 posterior para este albarán. Revisa la propuesta vigente antes de confirmar.'
    );
  END IF;

  RETURN private.apply_receipt_line_with_proposal(
    p_invoice_line_id,
    p_mapping_version_id,
    p_allocations,
    p_idempotency_key,
    p_dry_run,
    p_interpretation_proposal_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_receipt_line(
  p_invoice_line_id uuid,
  p_mapping_version_id uuid,
  p_allocations jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_dry_run boolean DEFAULT false,
  p_interpretation_proposal_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT private.apply_receipt_line_with_proposal_idempotent(
    p_invoice_line_id,
    p_mapping_version_id,
    p_allocations,
    p_idempotency_key,
    p_dry_run,
    p_interpretation_proposal_id
  );
$$;

REVOKE ALL ON FUNCTION private.apply_receipt_line_with_proposal_idempotent(uuid, uuid, jsonb, text, boolean, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.apply_receipt_line_with_proposal_idempotent(uuid, uuid, jsonb, text, boolean, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_receipt_line(uuid, uuid, jsonb, text, boolean, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_receipt_line(uuid, uuid, jsonb, text, boolean, uuid)
  TO authenticated, service_role;
