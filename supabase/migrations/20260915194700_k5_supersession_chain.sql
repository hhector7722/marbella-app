-- K5: el fingerprint describe el input reproducible; no es la identidad de una
-- revisión histórica. Recalcular una propuesta crea un nuevo hecho append-only
-- que supersede al anterior aunque el resultado determinista sea idéntico.

DROP INDEX IF EXISTS public.purchase_interpretation_proposals_input_fingerprint_uidx;

CREATE INDEX IF NOT EXISTS purchase_interpretation_proposals_input_fingerprint_idx
  ON public.purchase_interpretation_proposals(input_fingerprint);

-- La historia de una propuesta es una cadena, no un grafo con bifurcaciones.
-- Dos revisiones concurrentes del mismo hecho deben detenerse y recargarse.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_interpretation_proposals_single_successor_uidx
  ON public.purchase_interpretation_proposals(supersedes_proposal_id)
  WHERE supersedes_proposal_id IS NOT NULL;
