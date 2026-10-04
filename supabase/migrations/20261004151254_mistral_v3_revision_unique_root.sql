-- A Mistral extraction can produce one root proposal per source row. Human
-- revisions preserve that source row and are uniquely linked by
-- supersedes_proposal_id instead (single successor index already exists).
-- Keeping revisions inside the row index rejects every normal K5 mapping edit.
DROP INDEX IF EXISTS public.purchase_interpretation_proposals_mistral_v3_row_uidx;

CREATE UNIQUE INDEX purchase_interpretation_proposals_mistral_v3_row_uidx
  ON public.purchase_interpretation_proposals (document_extraction_id, source_row_index)
  WHERE normalizer_version = 'mistral-pipeline-v3'
    AND source_row_index IS NOT NULL
    AND supersedes_proposal_id IS NULL;
