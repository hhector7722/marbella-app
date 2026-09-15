-- K5 follow-up: representar explícitamente el caso "sin perfil" sin inventar
-- una identidad/version/hash ficticios. Estos casos solo pueden quedar en
-- needs_review; ready_for_review sigue exigiendo un perfil versionado completo.

ALTER TABLE public.purchase_interpretation_proposals
  ALTER COLUMN supplier_profile_id DROP NOT NULL,
  ALTER COLUMN supplier_profile_version DROP NOT NULL,
  ALTER COLUMN supplier_profile_hash DROP NOT NULL;

ALTER TABLE public.purchase_interpretation_proposals
  DROP CONSTRAINT IF EXISTS k5_profile_hash_shape;

ALTER TABLE public.purchase_interpretation_proposals
  ADD CONSTRAINT k5_profile_hash_shape CHECK (
    supplier_profile_hash IS NULL
    OR supplier_profile_hash ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE public.purchase_interpretation_proposals
  DROP CONSTRAINT IF EXISTS k5_profile_triplet_consistent;

ALTER TABLE public.purchase_interpretation_proposals
  ADD CONSTRAINT k5_profile_triplet_consistent CHECK (
    (
      supplier_profile_id IS NULL
      AND supplier_profile_version IS NULL
      AND supplier_profile_hash IS NULL
    )
    OR (
      supplier_profile_id IS NOT NULL
      AND btrim(supplier_profile_id) <> ''
      AND supplier_profile_version IS NOT NULL
      AND btrim(supplier_profile_version) <> ''
      AND supplier_profile_hash IS NOT NULL
      AND supplier_profile_hash ~ '^[0-9a-f]{64}$'
    )
  );

ALTER TABLE public.purchase_interpretation_proposals
  DROP CONSTRAINT IF EXISTS k5_ready_requires_profile;

ALTER TABLE public.purchase_interpretation_proposals
  ADD CONSTRAINT k5_ready_requires_profile CHECK (
    status <> 'ready_for_review'::public.purchase_interpretation_proposal_status
    OR (
      supplier_profile_id IS NOT NULL
      AND btrim(supplier_profile_id) <> ''
      AND supplier_profile_version IS NOT NULL
      AND btrim(supplier_profile_version) <> ''
      AND supplier_profile_hash IS NOT NULL
      AND supplier_profile_hash ~ '^[0-9a-f]{64}$'
    )
  );
