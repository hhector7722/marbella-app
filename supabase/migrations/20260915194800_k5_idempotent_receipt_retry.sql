-- K5: un reintento con la misma clave de idempotencia debe devolver el mismo
-- receipt ya enlazado a la misma propuesta. K4 devuelve pronto en ese caso y
-- su JSON histórico no incluye purchase_quantity/purchase_unit, por lo que no
-- debe pasar de nuevo por la comparación completa del preview K5.

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
  v_result jsonb;
BEGIN
  IF p_interpretation_proposal_id IS NULL THEN
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
  -- Cualquier otro caso sigue pasando por la validación K5/K4 normal.
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
