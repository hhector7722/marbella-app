-- K5: propuesta durable de interpretación entre evidencia K3 y confirmación K4.
--
-- Fronteras:
--   * K3 sigue siendo evidencia append-only.
--   * K5 solo propone/interpreta; nunca escribe stock ni precios.
--   * K4 sigue siendo el único productor económico y revalida la propuesta
--     dentro de la misma transacción antes de confirmar.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'purchase_interpretation_proposal_status'
  ) THEN
    CREATE TYPE public.purchase_interpretation_proposal_status AS ENUM (
      'needs_mapping',
      'needs_review',
      'excluded',
      'ready_for_review'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.purchase_interpretation_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_set_id uuid NOT NULL,
  purchase_invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id),
  document_extraction_id uuid NOT NULL REFERENCES public.document_extractions(id),
  supplier_id bigint NOT NULL REFERENCES public.suppliers(id),

  supplier_profile_id text NOT NULL,
  supplier_profile_version text NOT NULL,
  supplier_profile_hash text NOT NULL,
  normalizer_version text NOT NULL,
  source_file_hash text NOT NULL,
  input_fingerprint text NOT NULL,

  source_table_index integer,
  source_row_index integer,
  source_item_name text,

  mapping_version_id uuid REFERENCES public.purchase_mapping_versions(id),
  ingredient_id uuid REFERENCES public.ingredients(id),
  status public.purchase_interpretation_proposal_status NOT NULL,

  observed jsonb NOT NULL DEFAULT '{}'::jsonb,
  interpreted jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_reasons text[] NOT NULL DEFAULT '{}'::text[],
  warnings text[] NOT NULL DEFAULT '{}'::text[],

  -- Snapshot tipado que K4 puede comparar de forma exacta con la línea y con
  -- su propia previsualización. Los estados no confirmables pueden dejarlo
  -- incompleto; ready_for_review exige la parte económica necesaria.
  line_quantity numeric,
  line_unit text,
  observed_unit_price numeric,
  line_total numeric,
  physical_quantity numeric,
  base_unit text,
  purchase_quantity numeric,
  purchase_unit text,
  normalized_unit_price numeric,

  supersedes_proposal_id uuid REFERENCES public.purchase_interpretation_proposals(id),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT k5_profile_hash_shape CHECK (supplier_profile_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT k5_source_hash_shape CHECK (source_file_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT k5_fingerprint_shape CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT k5_source_indexes_nonnegative CHECK (
    (source_table_index IS NULL OR source_table_index >= 0)
    AND (source_row_index IS NULL OR source_row_index >= 0)
  ),
  CONSTRAINT k5_allocations_array CHECK (jsonb_typeof(proposed_allocations) = 'array'),
  CONSTRAINT k5_mapping_ingredient_pair CHECK (
    (mapping_version_id IS NULL AND ingredient_id IS NULL)
    OR (mapping_version_id IS NOT NULL AND ingredient_id IS NOT NULL)
  ),
  CONSTRAINT k5_ready_snapshot_complete CHECK (
    status <> 'ready_for_review'::public.purchase_interpretation_proposal_status
    OR (
      mapping_version_id IS NOT NULL
      AND ingredient_id IS NOT NULL
      AND source_item_name IS NOT NULL AND btrim(source_item_name) <> ''
      AND line_quantity IS NOT NULL AND line_quantity > 0
      AND line_unit IS NOT NULL AND btrim(line_unit) <> ''
      AND observed_unit_price IS NOT NULL AND observed_unit_price > 0
      AND physical_quantity IS NOT NULL AND physical_quantity > 0
      AND base_unit IS NOT NULL AND btrim(base_unit) <> ''
      AND purchase_quantity IS NOT NULL AND purchase_quantity > 0
      AND purchase_unit IS NOT NULL AND btrim(purchase_unit) <> ''
      AND normalized_unit_price IS NOT NULL AND normalized_unit_price > 0
      AND cardinality(review_reasons) = 0
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_interpretation_proposals_input_fingerprint_uidx
  ON public.purchase_interpretation_proposals(input_fingerprint);
CREATE INDEX IF NOT EXISTS purchase_interpretation_proposals_invoice_idx
  ON public.purchase_interpretation_proposals(purchase_invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_interpretation_proposals_extraction_idx
  ON public.purchase_interpretation_proposals(document_extraction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_interpretation_proposals_supersedes_idx
  ON public.purchase_interpretation_proposals(supersedes_proposal_id)
  WHERE supersedes_proposal_id IS NOT NULL;

-- La línea apunta explícitamente a la propuesta que la originó/revisó. No se
-- selecciona nunca una extracción ni una propuesta por "latest" al confirmar.
ALTER TABLE public.purchase_invoice_lines
  ADD COLUMN IF NOT EXISTS interpretation_proposal_id uuid
  REFERENCES public.purchase_interpretation_proposals(id);
CREATE INDEX IF NOT EXISTS purchase_invoice_lines_interpretation_proposal_idx
  ON public.purchase_invoice_lines(interpretation_proposal_id)
  WHERE interpretation_proposal_id IS NOT NULL;

-- El vínculo de confirmación es append-only y separado del ledger. Evita
-- modificar la propuesta para marcarla como confirmada: ese estado se deriva.
CREATE TABLE IF NOT EXISTS public.purchase_receipt_interpretation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interpretation_proposal_id uuid NOT NULL UNIQUE
    REFERENCES public.purchase_interpretation_proposals(id),
  receipt_confirmation_id uuid NOT NULL UNIQUE
    REFERENCES public.purchase_receipt_confirmations(id),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_interpretation_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_interpretation_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.purchase_interpretation_proposals FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.purchase_interpretation_proposals TO service_role;
GRANT SELECT, INSERT ON TABLE public.purchase_interpretation_proposals TO authenticated;

CREATE POLICY k5_interpretation_proposals_select_manager_admin
  ON public.purchase_interpretation_proposals
  FOR SELECT TO authenticated
  USING (public.is_purchase_manager_or_admin());

CREATE POLICY k5_interpretation_proposals_insert_manager_admin
  ON public.purchase_interpretation_proposals
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_purchase_manager_or_admin()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_invoices pi
      WHERE pi.id = purchase_invoice_id
        AND pi.supplier_id = supplier_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.document_extractions de
      WHERE de.id = document_extraction_id
        AND de.invoice_id = purchase_invoice_id
        AND de.file_version_hash = source_file_hash
        AND de.status = 'success'::public.extraction_status
    )
  );

DROP TRIGGER IF EXISTS purchase_interpretation_proposals_append_only
  ON public.purchase_interpretation_proposals;
CREATE TRIGGER purchase_interpretation_proposals_append_only
  BEFORE UPDATE OR DELETE ON public.purchase_interpretation_proposals
  FOR EACH ROW EXECUTE FUNCTION public.prevent_k2_append_only_mutation();

REVOKE ALL ON TABLE public.purchase_receipt_interpretation_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.purchase_receipt_interpretation_links TO service_role;
GRANT SELECT ON TABLE public.purchase_receipt_interpretation_links TO authenticated;

CREATE POLICY k5_receipt_interpretation_links_select_manager_admin
  ON public.purchase_receipt_interpretation_links
  FOR SELECT TO authenticated
  USING (public.is_purchase_manager_or_admin());

DROP TRIGGER IF EXISTS purchase_receipt_interpretation_links_append_only
  ON public.purchase_receipt_interpretation_links;
CREATE TRIGGER purchase_receipt_interpretation_links_append_only
  BEFORE UPDATE OR DELETE ON public.purchase_receipt_interpretation_links
  FOR EACH ROW EXECUTE FUNCTION public.prevent_k2_append_only_mutation();

-- Envoltorio K5. La función económica K4 de cinco argumentos NO se modifica:
-- esta función valida la propuesta, ejecuta primero la previsualización K4 y
-- solo después delega en el productor económico existente.
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

  -- K4 sigue siendo el productor de cantidades económicas. Primero se ejecuta
  -- su preview en la misma transacción y se compara exactamente con el snapshot K5.
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
     OR (v_preview->>'normalized_unit_price')::numeric IS DISTINCT FROM v_proposal.normalized_unit_price THEN
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

-- Sustituye solo la envoltura pública. Los clientes existentes siguen enviando
-- los cinco argumentos históricos; el sexto tiene DEFAULT NULL.
DROP FUNCTION IF EXISTS public.apply_receipt_line(uuid, uuid, jsonb, text, boolean);
CREATE FUNCTION public.apply_receipt_line(
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
  SELECT private.apply_receipt_line_with_proposal(
    p_invoice_line_id,
    p_mapping_version_id,
    p_allocations,
    p_idempotency_key,
    p_dry_run,
    p_interpretation_proposal_id
  );
$$;

REVOKE ALL ON FUNCTION public.apply_receipt_line(uuid, uuid, jsonb, text, boolean, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_receipt_line(uuid, uuid, jsonb, text, boolean, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.apply_receipt_line_with_proposal(uuid, uuid, jsonb, text, boolean, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.apply_receipt_line_with_proposal(uuid, uuid, jsonb, text, boolean, uuid)
  TO authenticated, service_role;
