-- Hardening productor payroll_monthly_totals:
-- hash de documento, parser_version, auditoría append-only de importaciones.
-- RLS manager. Sin tocar Hours Engine / Labor / Shadow.

-- 1) Columnas en payroll_monthly_totals
ALTER TABLE public.payroll_monthly_totals
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS parser_version integer,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.payroll_monthly_totals.content_hash IS
  'SHA-256 hex del PDF resumen; idempotencia y detección de rectificaciones';
COMMENT ON COLUMN public.payroll_monthly_totals.parser_version IS
  'Versión del parser que produjo total_company_cost';
COMMENT ON COLUMN public.payroll_monthly_totals.source IS
  'Origen de ingestión (gmail_summary, manual, …)';

CREATE UNIQUE INDEX IF NOT EXISTS payroll_monthly_totals_content_hash_uidx
  ON public.payroll_monthly_totals (content_hash)
  WHERE content_hash IS NOT NULL;

-- 2) Auditoría de importación (append-only)
CREATE TABLE IF NOT EXISTS public.payroll_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'gmail_summary',
  parser_version integer NOT NULL,
  content_hash text,
  filename text,
  period_ym text,
  period_start date,
  period_end date,
  amount_detected numeric(12,2),
  amount_selected numeric(12,2),
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  label_used text,
  status text NOT NULL,
  validation_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  CONSTRAINT payroll_import_runs_status_check CHECK (
    status = ANY (
      ARRAY[
        'imported'::text,
        'skipped_duplicate'::text,
        'rejected_validation'::text,
        'rectification_pending'::text,
        'error'::text
      ]
    )
  )
);

COMMENT ON TABLE public.payroll_import_runs IS
  'Historial append-only de ingestión del resumen de nóminas empresa. Nunca borrar.';

CREATE INDEX IF NOT EXISTS payroll_import_runs_created_at_idx
  ON public.payroll_import_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS payroll_import_runs_period_ym_idx
  ON public.payroll_import_runs (period_ym);
CREATE INDEX IF NOT EXISTS payroll_import_runs_content_hash_idx
  ON public.payroll_import_runs (content_hash);

ALTER TABLE public.payroll_import_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_select_payroll_import_runs" ON public.payroll_import_runs;
DROP POLICY IF EXISTS "manager_insert_payroll_import_runs" ON public.payroll_import_runs;
-- Sin UPDATE/DELETE: historial inmutable vía políticas (service_role bypasa RLS).

CREATE POLICY "manager_select_payroll_import_runs"
ON public.payroll_import_runs
FOR SELECT
TO authenticated
USING (public.is_manager());

CREATE POLICY "manager_insert_payroll_import_runs"
ON public.payroll_import_runs
FOR INSERT
TO authenticated
WITH CHECK (public.is_manager());
