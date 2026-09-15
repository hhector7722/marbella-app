-- Un proveedor sin perfil no debe ganar un perfil ficticio. K5 conserva una
-- propuesta needs_review con metadatos de perfil NULL para que el bloqueo sea
-- durable y visible, sin inventar semántica documental.
ALTER TABLE public.purchase_interpretation_proposals
  ALTER COLUMN supplier_profile_id DROP NOT NULL,
  ALTER COLUMN supplier_profile_version DROP NOT NULL,
  ALTER COLUMN supplier_profile_hash DROP NOT NULL;

ALTER TABLE public.purchase_interpretation_proposals
  DROP CONSTRAINT IF EXISTS k5_profile_metadata_all_or_none;
ALTER TABLE public.purchase_interpretation_proposals
  ADD CONSTRAINT k5_profile_metadata_all_or_none CHECK (
    (supplier_profile_id IS NULL AND supplier_profile_version IS NULL AND supplier_profile_hash IS NULL)
    OR
    (supplier_profile_id IS NOT NULL AND supplier_profile_version IS NOT NULL AND supplier_profile_hash IS NOT NULL)
  );

ALTER TABLE public.purchase_interpretation_proposals
  DROP CONSTRAINT IF EXISTS k5_ready_snapshot_complete;
ALTER TABLE public.purchase_interpretation_proposals
  ADD CONSTRAINT k5_ready_snapshot_complete CHECK (
    status <> 'ready_for_review'::public.purchase_interpretation_proposal_status
    OR (
      supplier_profile_id IS NOT NULL AND btrim(supplier_profile_id) <> ''
      AND supplier_profile_version IS NOT NULL AND btrim(supplier_profile_version) <> ''
      AND supplier_profile_hash IS NOT NULL AND supplier_profile_hash ~ '^[0-9a-f]{64}$'
      AND mapping_version_id IS NOT NULL
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
  );

CREATE UNIQUE INDEX IF NOT EXISTS purchase_invoice_lines_interpretation_proposal_uidx
  ON public.purchase_invoice_lines(interpretation_proposal_id)
  WHERE interpretation_proposal_id IS NOT NULL;
