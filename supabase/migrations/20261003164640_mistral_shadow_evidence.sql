-- Evidencia Mistral en sombra. No participa en K4/K5 ni en los hechos económicos.
CREATE TABLE IF NOT EXISTS public.document_shadow_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id),
  source_bucket text NOT NULL,
  source_path text NOT NULL,
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  extractor text NOT NULL CHECK (extractor = 'mistral'),
  extractor_version text NOT NULL,
  schema_version text NOT NULL,
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  raw_json_artifact jsonb,
  canonical_json jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  supersedes_id uuid REFERENCES public.document_shadow_extractions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'success' AND raw_json_artifact IS NOT NULL AND canonical_json IS NOT NULL)
      OR (status = 'failed' AND canonical_json IS NULL))
);

CREATE INDEX IF NOT EXISTS document_shadow_extractions_source_idx
  ON public.document_shadow_extractions(source_invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS document_shadow_extractions_cache_idx
  ON public.document_shadow_extractions(file_sha256, extractor_version, status, created_at DESC);

ALTER TABLE public.document_shadow_extractions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_shadow_extractions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.document_shadow_extractions TO service_role;

CREATE OR REPLACE FUNCTION public.reject_shadow_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'document_shadow_extractions is append-only';
END;
$$;

DROP TRIGGER IF EXISTS document_shadow_extractions_immutable ON public.document_shadow_extractions;
CREATE TRIGGER document_shadow_extractions_immutable
  BEFORE UPDATE OR DELETE ON public.document_shadow_extractions
  FOR EACH ROW EXECUTE FUNCTION public.reject_shadow_evidence_mutation();

COMMENT ON TABLE public.document_shadow_extractions IS
  'Versiones inmutables de OCR Mistral en sombra; no crean propuestas, stock ni precios.';
