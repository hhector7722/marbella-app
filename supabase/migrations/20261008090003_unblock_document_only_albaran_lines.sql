-- Las propuestas Mistral anteriores copiaron avisos de totales del documento
-- a review_reasons de cada producto. Se crea una sucesora append-only solo
-- cuando la línea ya tiene identidad, presentación y normalización completas.
-- No se confirma ningún movimiento ni se cambia ningún precio.
DO $$
DECLARE
  v record;
  v_mapping_id uuid;
  v_proposal_id uuid;
  v_alias_key text;
BEGIN
  FOR v IN
    SELECT p.*, l.id AS invoice_line_id,
      m.id AS source_mapping_id,
      m.supplier_item_name AS mapped_name,
      m.conversion_factor AS mapped_factor,
      m.line_billing_unit AS mapped_billing_unit,
      m.line_content_qty AS mapped_content_qty,
      m.line_content_unit AS mapped_content_unit
    FROM public.purchase_interpretation_proposals p
    JOIN public.purchase_invoice_lines l ON l.interpretation_proposal_id = p.id
    JOIN public.purchase_mapping_versions m ON m.id = p.mapping_version_id
    WHERE p.normalizer_version = 'mistral-pipeline-v3'
      AND p.status = 'needs_review'
      AND cardinality(p.review_reasons) > 0
      AND p.review_reasons <@ p.warnings
      AND p.ingredient_id = m.ingredient_id
      AND p.supplier_id = m.supplier_id
      AND m.status <> 'rejected'
      AND p.physical_quantity > 0
      AND p.base_unit IS NOT NULL
      AND p.purchase_quantity > 0
      AND p.purchase_unit IS NOT NULL
      AND p.normalized_unit_price > 0
      AND p.supplier_profile_id IS NOT NULL
      AND p.supplier_profile_version IS NOT NULL
      AND p.supplier_profile_hash IS NOT NULL
      AND l.superseded_by_extraction_id IS NULL
      AND l.quantity = p.line_quantity
      AND l.unit_price = p.observed_unit_price
      AND (p.line_total IS NULL OR l.total_price = p.line_total)
      AND lower(btrim(l.line_unit)) = lower(btrim(p.line_unit))
      AND l.original_name = p.source_item_name
      AND (l.mapped_ingredient_id IS NULL OR l.mapped_ingredient_id = p.ingredient_id)
      AND (
        lower(btrim(m.supplier_item_name)) = lower(btrim(p.source_item_name))
        OR (
          p.interpreted->>'match_source' IN ('code', 'exact_name', 'alias')
          AND (p.interpreted->>'match_score')::numeric >= 0.95
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_interpretation_proposals successor
        WHERE successor.supersedes_proposal_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.purchase_interpretation_proposals same_evidence
        JOIN public.purchase_invoice_lines confirmed_line
          ON confirmed_line.interpretation_proposal_id = same_evidence.id
        JOIN public.purchase_receipt_confirmations confirmation
          ON confirmation.purchase_invoice_line_id = confirmed_line.id
        WHERE same_evidence.document_extraction_id = p.document_extraction_id
          AND same_evidence.source_table_index IS NOT DISTINCT FROM p.source_table_index
          AND same_evidence.source_row_index IS NOT DISTINCT FROM p.source_row_index
      )
    FOR UPDATE OF l
  LOOP
    v_mapping_id := v.source_mapping_id;
    IF lower(btrim(v.mapped_name)) <> lower(btrim(v.source_item_name)) THEN
      -- La identidad exacta encontrada en memoria puede tener un nombre OCR
      -- nuevo. K4 exige un alias con el nombre observado; una coincidencia
      -- difusa no lo crea automáticamente.
      v_alias_key := 'k5-document-alias-v1:' || v.source_mapping_id::text || ':' ||
        encode(sha256(convert_to(v.source_item_name, 'UTF8')), 'hex');
      SELECT id INTO v_mapping_id
      FROM public.purchase_mapping_versions
      WHERE idempotency_key = v_alias_key;
      IF v_mapping_id IS NULL THEN
        INSERT INTO public.purchase_mapping_versions (
          supplier_id, supplier_item_name, ingredient_id, conversion_factor,
          line_billing_unit, line_content_qty, line_content_unit,
          source_document_extraction_id, idempotency_key, proposed_by, note
        ) VALUES (
          v.supplier_id, v.source_item_name, v.ingredient_id, v.mapped_factor,
          v.mapped_billing_unit, v.mapped_content_qty, v.mapped_content_unit,
          v.document_extraction_id, v_alias_key, v.created_by,
          'Alias revisable de propuesta bloqueada solo por un aviso documental'
        ) RETURNING id INTO v_mapping_id;
      END IF;
    END IF;

    INSERT INTO public.purchase_interpretation_proposals (
      proposal_set_id, purchase_invoice_id, document_extraction_id, supplier_id,
      supplier_profile_id, supplier_profile_version, supplier_profile_hash,
      normalizer_version, source_file_hash, input_fingerprint,
      source_table_index, source_row_index, source_item_name,
      mapping_version_id, ingredient_id, status,
      observed, interpreted, normalized, pricing, proposed_allocations,
      review_reasons, warnings, line_quantity, line_unit, observed_unit_price,
      line_total, physical_quantity, base_unit, purchase_quantity,
      purchase_unit, normalized_unit_price, supersedes_proposal_id,
      created_by, provenance
    ) VALUES (
      gen_random_uuid(), v.purchase_invoice_id, v.document_extraction_id, v.supplier_id,
      v.supplier_profile_id, v.supplier_profile_version, v.supplier_profile_hash,
      v.normalizer_version, v.source_file_hash,
      encode(sha256(convert_to('document-only-ready-v1:' || v.id::text, 'UTF8')), 'hex'),
      v.source_table_index, v.source_row_index, v.source_item_name,
      v_mapping_id, v.ingredient_id, 'ready_for_review',
      v.observed, v.interpreted, v.normalized, v.pricing, v.proposed_allocations,
      '{}'::text[], v.warnings, v.line_quantity, v.line_unit, v.observed_unit_price,
      v.line_total, v.physical_quantity, v.base_unit, v.purchase_quantity,
      v.purchase_unit, v.normalized_unit_price, v.id,
      v.created_by, v.provenance || jsonb_build_object(
        'revision', 'document_warning_separated', 'economic_effects', false
      )
    ) RETURNING id INTO v_proposal_id;

    UPDATE public.purchase_invoice_lines
    SET interpretation_proposal_id = v_proposal_id,
        mapped_ingredient_id = v.ingredient_id,
        status = 'mapped'
    WHERE id = v.invoice_line_id
      AND interpretation_proposal_id = v.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se pudo enlazar la revisión documental de la línea %', v.invoice_line_id;
    END IF;
  END LOOP;
END;
$$;
