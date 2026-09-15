-- K5 calcula precios con aritmética racional exacta y solo redondea en la
-- frontera persistida de precio. En producción, ingredients.current_price,
-- ingredient_price_history.{old_price,new_price} y
-- purchase_receipt_confirmations.normalized_unit_price son numeric(18,8).
--
-- K4 mantiene internamente numeric sin typmod durante el preview, por lo que
-- divisiones válidas como 20,99375 / 60 producen más de 8 decimales. La
-- revalidación K5 debe comparar el precio a la misma escala canónica que se
-- persistirá, sin relajar las demás magnitudes.

CREATE OR REPLACE FUNCTION private.apply_receipt_line_with_proposal(
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
  v_actor_id uuid := auth.uid();
  v_line public.purchase_invoice_lines%ROWTYPE;
  v_invoice public.purchase_invoices%ROWTYPE;
  v_proposal public.purchase_interpretation_proposals%ROWTYPE;
  v_extraction public.document_extractions%ROWTYPE;
  v_preview jsonb;
  v_result jsonb;
  v_confirmation_id uuid;
  v_existing_link public.purchase_receipt_interpretation_links%ROWTYPE;
BEGIN
  IF p_interpretation_proposal_id IS NULL THEN
    RETURN private.apply_receipt_line(
      p_invoice_line_id,
      p_mapping_version_id,
      p_allocations,
      p_idempotency_key,
      p_dry_run
    );
  END IF;

  IF v_actor_id IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Solo manager o admin puede confirmar una recepción.');
  END IF;

  SELECT * INTO v_line
  FROM public.purchase_invoice_lines
  WHERE id = p_invoice_line_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La línea de albarán no existe.');
  END IF;

  SELECT * INTO v_proposal
  FROM public.purchase_interpretation_proposals
  WHERE id = p_interpretation_proposal_id
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La propuesta de interpretación no existe.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.purchase_interpretation_proposals successor
    WHERE successor.supersedes_proposal_id = v_proposal.id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La propuesta fue sustituida por una revisión posterior.');
  END IF;

  IF v_proposal.status <> 'ready_for_review'::public.purchase_interpretation_proposal_status
     OR v_proposal.mapping_version_id IS NULL
     OR v_proposal.ingredient_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La propuesta todavía tiene bloqueos de interpretación o mapeo.');
  END IF;

  IF v_line.interpretation_proposal_id IS DISTINCT FROM v_proposal.id
     OR v_proposal.mapping_version_id IS DISTINCT FROM p_mapping_version_id
     OR v_line.mapped_ingredient_id IS DISTINCT FROM v_proposal.ingredient_id
     OR lower(btrim(v_line.original_name)) IS DISTINCT FROM lower(btrim(v_proposal.source_item_name))
     OR v_line.quantity IS DISTINCT FROM v_proposal.line_quantity
     OR lower(btrim(v_line.line_unit)) IS DISTINCT FROM lower(btrim(v_proposal.line_unit))
     OR v_line.unit_price IS DISTINCT FROM v_proposal.observed_unit_price
     OR (v_proposal.line_total IS NOT NULL AND v_line.total_price IS DISTINCT FROM v_proposal.line_total) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La línea ya no coincide exactamente con la propuesta revisada.');
  END IF;

  SELECT * INTO v_invoice
  FROM public.purchase_invoices
  WHERE id = v_line.invoice_id
  FOR KEY SHARE;
  IF NOT FOUND
     OR v_proposal.purchase_invoice_id IS DISTINCT FROM v_invoice.id
     OR v_proposal.supplier_id IS DISTINCT FROM v_invoice.supplier_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La propuesta no pertenece al documento o proveedor de la línea.');
  END IF;

  SELECT * INTO v_extraction
  FROM public.document_extractions
  WHERE id = v_proposal.document_extraction_id
  FOR KEY SHARE;
  IF NOT FOUND
     OR v_extraction.invoice_id IS DISTINCT FROM v_invoice.id
     OR v_extraction.status <> 'success'::public.extraction_status
     OR v_extraction.file_version_hash IS DISTINCT FROM v_proposal.source_file_hash
     OR (v_invoice.content_sha256 IS NOT NULL AND v_invoice.content_sha256 IS DISTINCT FROM v_proposal.source_file_hash) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La propuesta no corresponde a la versión documental confirmada.');
  END IF;

  IF btrim(v_proposal.supplier_profile_id) = ''
     OR btrim(v_proposal.supplier_profile_version) = ''
     OR v_proposal.supplier_profile_hash !~ '^[0-9a-f]{64}$'
     OR btrim(v_proposal.normalizer_version) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Falta la versión reproducible del perfil o normalizador.');
  END IF;

  v_preview := private.apply_receipt_line(
    p_invoice_line_id,
    p_mapping_version_id,
    p_allocations,
    p_idempotency_key,
    true
  );
  IF COALESCE((v_preview->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_preview || jsonb_build_object('interpretation_proposal_id', v_proposal.id);
  END IF;

  IF (v_preview->>'physical_quantity')::numeric IS DISTINCT FROM v_proposal.physical_quantity
     OR lower(v_preview->>'base_unit') IS DISTINCT FROM lower(v_proposal.base_unit)
     OR (v_preview->>'purchase_quantity')::numeric IS DISTINCT FROM v_proposal.purchase_quantity
     OR lower(v_preview->>'purchase_unit') IS DISTINCT FROM lower(v_proposal.purchase_unit)
     OR round((v_preview->>'normalized_unit_price')::numeric, 8)
        IS DISTINCT FROM round(v_proposal.normalized_unit_price, 8) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'needs_review',
      'message', 'La normalización K5 ya no coincide con la previsualización económica K4.'
    );
  END IF;

  IF p_dry_run THEN
    RETURN v_preview || jsonb_build_object(
      'interpretation_proposal_id', v_proposal.id,
      'proposal_validated', true
    );
  END IF;

  v_result := private.apply_receipt_line(
    p_invoice_line_id,
    p_mapping_version_id,
    p_allocations,
    p_idempotency_key,
    false
  );
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result || jsonb_build_object('interpretation_proposal_id', v_proposal.id);
  END IF;

  v_confirmation_id := (v_result->>'confirmation_id')::uuid;

  INSERT INTO public.purchase_receipt_interpretation_links (
    interpretation_proposal_id,
    receipt_confirmation_id,
    actor_profile_id
  ) VALUES (
    v_proposal.id,
    v_confirmation_id,
    v_actor_id
  )
  ON CONFLICT (interpretation_proposal_id) DO NOTHING;

  SELECT * INTO v_existing_link
  FROM public.purchase_receipt_interpretation_links
  WHERE interpretation_proposal_id = v_proposal.id;

  IF NOT FOUND OR v_existing_link.receipt_confirmation_id IS DISTINCT FROM v_confirmation_id THEN
    RAISE EXCEPTION 'K5_RECEIPT_LINK_CONFLICT: proposal % no enlaza con confirmation %',
      v_proposal.id, v_confirmation_id;
  END IF;

  RETURN v_result || jsonb_build_object(
    'interpretation_proposal_id', v_proposal.id,
    'proposal_validated', true
  );
END;
$$;
