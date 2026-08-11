-- K2 infrastructure only. No K2b execution and no product data changes.
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.k2_execution_runs (
  run_id uuid PRIMARY KEY,
  operation text NOT NULL CHECK (operation = 'k2b'),
  status text NOT NULL CHECK (status IN ('CREATED', 'PREFLIGHT', 'AUTHORIZED', 'WRITING', 'COMMITTED', 'ROLLED_BACK', 'FAILED')),
  actor text NOT NULL,
  snapshot_ref text NOT NULL,
  snapshot_checksum text NOT NULL,
  allowlist_ref text NOT NULL,
  allowlist_checksum text NOT NULL,
  expected_operations integer NOT NULL CHECK (expected_operations >= 0),
  actual_operations integer NOT NULL DEFAULT 0 CHECK (actual_operations >= 0),
  expected_checksum text NOT NULL,
  actual_checksum text,
  error_code text,
  error_detail jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  acquired_at timestamptz,
  finished_at timestamptz,
  committed_at timestamptz,
  rolled_back_at timestamptz,
  CONSTRAINT k2_execution_runs_terminal_timestamps CHECK (
    (status <> 'COMMITTED' OR committed_at IS NOT NULL)
    AND (status <> 'ROLLED_BACK' OR rolled_back_at IS NOT NULL)
  )
);

ALTER TABLE private.k2_execution_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.k2_execution_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.k2_execution_runs TO service_role;

DROP POLICY IF EXISTS k2_execution_runs_service_role ON private.k2_execution_runs;
CREATE POLICY k2_execution_runs_service_role
  ON private.k2_execution_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE private.k2_execution_runs IS
  'Registro único de ejecuciones K2b. No contiene datos funcionales ni autoriza por sí solo una escritura.';
