/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const ALLOWLIST_PATH = 'sql/diagnostics/k2/2026-08-11-k2b-allowlist.json'
const SNAPSHOT_PATH = 'sql/diagnostics/k2/2026-08-10-k2-snapshot-37f7157a.json'
const EXPECTED_ALLOWLIST_CHECKSUM = '999f93c0b071fbc05f08bdd05f5797ef85be79020184f0eaf0e8d62a1374b0b4'
const EXPECTED_SNAPSHOT_CHECKSUM = '80ff612d1cd2524ad09588e4c0e7e648242987839a5a95fcaf5c59eb4fb60ea3'
const EXPECTED_COUNTS = { candidate_rows: 40, candidate_cells: 71, allowlist_operations: 71 }
const ALLOWED_COLUMNS = {
  'public.ingredients': new Set(['purchase_unit', 'unit_type']),
  'public.recipe_ingredients': new Set(['unit']),
}
const TERMINAL_STATES = new Set(['COMMITTED', 'ROLLED_BACK', 'FAILED'])

function blocked(reasons) {
  return { status: 'K2_WRITE_BLOCKED', reasons }
}

function calculateAllowlistChecksum(operations) {
  const lines = operations.map((entry) => [
    entry.table,
    entry.primary_key_column,
    entry.primary_key_value,
    entry.column,
    JSON.stringify(entry.before_value),
    JSON.stringify(entry.expected_value),
  ].join('\t')).sort()
  return crypto.createHash('sha256').update(`k2b-allowlist-v1\n${lines.join('\n')}\n`).digest('hex')
}

function verifyExpectedChecksum(declared, computed, expected = EXPECTED_ALLOWLIST_CHECKSUM) {
  const reasons = []
  if (declared !== expected) reasons.push('ALLOWLIST_CHECKSUM_EXPECTED_MISMATCH')
  if (computed !== declared) reasons.push('ALLOWLIST_CHECKSUM_RECALCULATION_MISMATCH')
  return reasons.length ? blocked(reasons) : { status: 'PASS', reasons: [] }
}

function verifyAllowlist(allowlist) {
  const reasons = []
  const operations = allowlist.operations ?? []
  const counts = allowlist.counts ?? {}
  const rows = new Set()
  const keys = new Set()

  if (allowlist.allowlist_version !== 'k2b-allowlist-v1') reasons.push('ALLOWLIST_VERSION_INVALID')
  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (counts[key] !== expected) reasons.push(`ALLOWLIST_COUNT_${key.toUpperCase()}_MISMATCH`)
  }
  if (operations.length !== EXPECTED_COUNTS.allowlist_operations) reasons.push('ALLOWLIST_OPERATION_COUNT_MISMATCH')

  for (const entry of operations) {
    const rowKey = `${entry.table}|${entry.primary_key_value}`
    const operationKey = `${rowKey}|${entry.column}`
    rows.add(rowKey)
    if (keys.has(operationKey)) reasons.push(`ALLOWLIST_DUPLICATE:${operationKey}`)
    keys.add(operationKey)
    if (!ALLOWED_COLUMNS[entry.table]?.has(entry.column)) reasons.push(`ALLOWLIST_SCOPE:${operationKey}`)
    if (entry.primary_key_column !== 'id' || !entry.primary_key_value) reasons.push(`ALLOWLIST_PK:${operationKey}`)
    if (entry.before_value !== 'u' && entry.before_value !== 'unitat') reasons.push(`ALLOWLIST_BEFORE:${operationKey}`)
    if (entry.expected_value !== 'ud') reasons.push(`ALLOWLIST_EXPECTED:${operationKey}`)
    if (!entry.source_snapshot || !entry.evidence) reasons.push(`ALLOWLIST_EVIDENCE:${operationKey}`)
  }
  if (rows.size !== EXPECTED_COUNTS.candidate_rows) reasons.push('ALLOWLIST_CANDIDATE_ROWS_MISMATCH')
  if (keys.size !== EXPECTED_COUNTS.candidate_cells) reasons.push('ALLOWLIST_CANDIDATE_CELLS_MISMATCH')

  const checksum = calculateAllowlistChecksum(operations)
  const checksumResult = verifyExpectedChecksum(allowlist.allowlist_checksum, checksum)
  reasons.push(...checksumResult.reasons)
  return reasons.length ? blocked([...new Set(reasons)]) : { status: 'PASS', reasons: [], checksum }
}

function loadApprovedAllowlist(path = ALLOWLIST_PATH) {
  return JSON.parse(fs.readFileSync(path, 'utf8'))
}

function verifySnapshot(snapshot) {
  if (!snapshot || snapshot.checksum_sha256 !== EXPECTED_SNAPSHOT_CHECKSUM) return blocked(['SNAPSHOT_CHECKSUM_MISMATCH'])
  if (!snapshot.rows?.ingredients || !snapshot.rows?.recipe_ingredients) return blocked(['SNAPSHOT_ROWS_MISSING'])
  return { status: 'PASS', reasons: [] }
}

function evaluateGlobalWriteGate(state, phase = 'preflight') {
  const reasons = []
  const required = [
    ['r1Pass', 'R1_FAIL'],
    ['allowlistPass', 'ALLOWLIST_INVALID'],
    ['snapshotPass', 'SNAPSHOT_FAIL'],
    ['dryRunPass', 'DRY_RUN_FAIL'],
    ['rollbackPass', 'ROLLBACK_NOT_READY'],
    ['writersControlled', 'WRITERS_NOT_CONTROLLED'],
    ['invariantsPass', 'INVARIANTS_FAIL'],
    ['serviceRole', 'SERVICE_ROLE_REQUIRED'],
  ]
  for (const [field, reason] of required) if (state[field] !== true) reasons.push(reason)
  if (phase === 'write') {
    if (state.freezeActive !== true) reasons.push('FREEZE_INACTIVE')
    if (state.transactionAuthorized !== true) reasons.push('TRANSACTION_NOT_AUTHORIZED')
  }
  return reasons.length ? blocked([...new Set(reasons)]) : { status: 'K2_WRITE_AUTHORIZED', reasons: [] }
}

function verifyPostconditions(allowlist, actualOperations, actualValues = {}) {
  const expected = allowlist.operations ?? []
  if (actualOperations.length !== expected.length) return blocked(['POSTCONDITION_OPERATION_COUNT_MISMATCH'])
  const actualByKey = new Map(actualOperations.map(entry => [`${entry.table}|${entry.primary_key_value}|${entry.column}`, entry]))
  for (const entry of expected) {
    const key = `${entry.table}|${entry.primary_key_value}|${entry.column}`
    const actual = actualByKey.get(key)
    if (!actual || actual.value !== entry.expected_value) return blocked([`POSTCONDITION_FAIL:${key}`])
  }
  if (actualValues.checksum && actualValues.checksum !== calculateAllowlistChecksum(expected.map(entry => ({ ...entry, before_value: entry.expected_value })))) {
    return blocked(['POSTCONDITION_CHECKSUM_MISMATCH'])
  }
  return { status: 'PASS', reasons: [] }
}

function canStartRun(existingStatus) {
  if (existingStatus === 'WRITING') return blocked(['RUN_STATE_UNCERTAIN'])
  if (TERMINAL_STATES.has(existingStatus)) return blocked(['RUN_ALREADY_FINISHED'])
  return { status: 'PASS', reasons: [] }
}

function resolveCommittedRetry(record, allowlistChecksum, snapshotChecksum) {
  if (record?.status !== 'COMMITTED') return { status: 'NOT_IDEMPOTENT' }
  if (record.allowlist_checksum !== allowlistChecksum || record.snapshot_checksum !== snapshotChecksum) return blocked(['COMMITTED_RUN_INPUT_MISMATCH'])
  return { status: 'COMMITTED', idempotent: true, wrote: false }
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`UNSAFE_IDENTIFIER:${value}`)
  return `"${value}"`
}

function buildK2bSql(allowlist, runId, metadata = {}) {
  const statements = [
    'BEGIN;',
    'SET LOCAL ROLE service_role;',
    `INSERT INTO private.k2_execution_runs (run_id, operation, status, actor, snapshot_ref, snapshot_checksum, allowlist_ref, allowlist_checksum, expected_operations, expected_checksum) VALUES (${quoteLiteral(runId)}::uuid, 'k2b', 'PREFLIGHT', 'service_role', ${quoteLiteral(metadata.snapshotRef ?? allowlist.source_snapshot)}, ${quoteLiteral(metadata.snapshotChecksum ?? EXPECTED_SNAPSHOT_CHECKSUM)}, ${quoteLiteral(metadata.allowlistRef ?? ALLOWLIST_PATH)}, ${quoteLiteral(allowlist.allowlist_checksum)}, ${allowlist.operations.length}, ${quoteLiteral(allowlist.allowlist_checksum)});`,
    `SELECT private.k2_acquire_domain_freeze(${quoteLiteral(runId)}::uuid, 'K2b allowlist execution', NULL, interval '15 minutes');`,
    `UPDATE private.k2_execution_runs SET status = 'AUTHORIZED', acquired_at = clock_timestamp() WHERE run_id = ${quoteLiteral(runId)}::uuid;`,
    `SELECT private.k2_authorize_transaction(${quoteLiteral(runId)}::uuid);`,
    `DO $$ DECLARE v_status jsonb; BEGIN v_status := private.k2_domain_freeze_status(); IF (v_status->>'active')::boolean IS DISTINCT FROM true OR v_status->>'run_id' IS DISTINCT FROM ${quoteLiteral(runId)} THEN RAISE EXCEPTION 'K2_WRITE_REVALIDATION_FAILED'; END IF; END $$;`,
    `UPDATE private.k2_execution_runs SET status = 'WRITING' WHERE run_id = ${quoteLiteral(runId)}::uuid;`,
  ]

  // FASE A — BEFORE VALIDATION
  statements.push(`DO $$ BEGIN`)
  for (const entry of allowlist.operations) {
    const table = entry.table
    const column = quoteIdentifier(entry.column)
    const id = quoteLiteral(entry.primary_key_value)
    const before = quoteLiteral(entry.before_value)
    statements.push(`IF NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ${id} AND ${column} IS NOT DISTINCT FROM ${before}) THEN RAISE EXCEPTION 'K2_BEFORE_CONFLICT:${entry.primary_key_value}:${entry.column}'; END IF;`)
  }
  statements.push(`END $$;`)

  // FASE B — MUTATION
  for (const entry of allowlist.operations) {
    const table = entry.table
    const column = quoteIdentifier(entry.column)
    const id = quoteLiteral(entry.primary_key_value)
    const expected = quoteLiteral(entry.expected_value)
    statements.push(`DO $$ DECLARE v_count integer; BEGIN UPDATE ${table} SET ${column} = ${expected} WHERE id = ${id}; GET DIAGNOSTICS v_count = ROW_COUNT; IF v_count <> 1 THEN RAISE EXCEPTION 'K2_WRITE_NOT_APPLIED:${entry.primary_key_value}:${entry.column}'; END IF; END $$;`)
  }

  // FASE C — POSTCONDITION
  statements.push(`DO $$ BEGIN`)
  for (const entry of allowlist.operations) {
    const table = entry.table
    const column = quoteIdentifier(entry.column)
    const id = quoteLiteral(entry.primary_key_value)
    const expected = quoteLiteral(entry.expected_value)
    statements.push(`IF NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ${id} AND ${column} IS NOT DISTINCT FROM ${expected}) THEN RAISE EXCEPTION 'K2_POSTCONDITION_FAIL:${entry.primary_key_value}:${entry.column}'; END IF;`)
  }
  statements.push(`END $$;`)

  statements.push(`UPDATE private.k2_execution_runs SET status = 'COMMITTED', actual_operations = ${allowlist.operations.length}, actual_checksum = ${quoteLiteral(allowlist.allowlist_checksum)}, committed_at = clock_timestamp(), finished_at = clock_timestamp() WHERE run_id = ${quoteLiteral(runId)}::uuid;`)
  statements.push('COMMIT;')
  return `${statements.join('\n')}\n`
}

function buildReleaseSql(runId) {
  return `SELECT private.k2_release_domain_freeze(${quoteLiteral(runId)}::uuid);\n`
}

function validateRunId(runId) {
  return typeof runId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)
}

function runPsql(poolerUrl, sql) {
  return spawnSync('psql', [poolerUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8', env: process.env })
}

function buildFailureSql(runId, errorCode, detail) {
  return `INSERT INTO private.k2_execution_runs (run_id, operation, status, actor, snapshot_ref, snapshot_checksum, allowlist_ref, allowlist_checksum, expected_operations, actual_operations, expected_checksum, error_code, error_detail, finished_at) VALUES (${quoteLiteral(runId)}::uuid, 'k2b', 'FAILED', 'service_role', ${quoteLiteral(SNAPSHOT_PATH)}, ${quoteLiteral(EXPECTED_SNAPSHOT_CHECKSUM)}, ${quoteLiteral(ALLOWLIST_PATH)}, ${quoteLiteral(EXPECTED_ALLOWLIST_CHECKSUM)}, ${EXPECTED_COUNTS.allowlist_operations}, 0, ${quoteLiteral(EXPECTED_ALLOWLIST_CHECKSUM)}, ${quoteLiteral(errorCode)}, ${quoteLiteral(JSON.stringify(detail))}::jsonb, clock_timestamp()) ON CONFLICT (run_id) DO UPDATE SET status = 'FAILED', error_code = EXCLUDED.error_code, error_detail = EXCLUDED.error_detail, finished_at = EXCLUDED.finished_at;\n`
}

function runK2b({ poolerUrl, runId, state, allowlistPath = ALLOWLIST_PATH, confirmation = false, execute = false }) {
  if (!validateRunId(runId)) return blocked(['RUN_ID_INVALID'])
  if (!execute) return blocked(['EXECUTION_DISABLED_UNTIL_EXPLICIT_RUN'])
  if (!confirmation || process.env.K2_WRITE_CONFIRMATION !== 'K2b') return blocked(['EXPLICIT_K2B_CONFIRMATION_REQUIRED'])

  const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'))
  const allowlistResult = verifyAllowlist(allowlist)
  if (allowlistResult.status !== 'PASS') return allowlistResult
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
  const snapshotResult = verifySnapshot(snapshot)
  if (snapshotResult.status !== 'PASS') return snapshotResult
  const preflight = evaluateGlobalWriteGate({ ...state, allowlistPass: true }, 'preflight')
  if (preflight.status !== 'K2_WRITE_AUTHORIZED') return preflight
  if (!poolerUrl) return blocked(['POSTGRES_POOLER_URL_REQUIRED'])

  const result = runPsql(poolerUrl, buildK2bSql(allowlist, runId))
  if (result.status !== 0) {
    runPsql(poolerUrl, buildFailureSql(runId, 'K2B_TRANSACTION_FAILED', { stderr: result.stderr?.trim() || 'UNKNOWN_DATABASE_ERROR' }))
    return blocked(['K2B_TRANSACTION_FAILED', result.stderr?.trim() || 'UNKNOWN_DATABASE_ERROR'])
  }
  const release = runPsql(poolerUrl, buildReleaseSql(runId))
  if (release.status !== 0) return blocked(['K2_FREEZE_RELEASE_FAILED', release.stderr?.trim() || 'UNKNOWN_DATABASE_ERROR'])
  return { status: 'COMMITTED', stdout: result.stdout }
}

module.exports = {
  ALLOWLIST_PATH,
  EXPECTED_ALLOWLIST_CHECKSUM,
  EXPECTED_COUNTS,
  EXPECTED_SNAPSHOT_CHECKSUM,
  TERMINAL_STATES,
  calculateAllowlistChecksum,
  loadApprovedAllowlist,
  verifyExpectedChecksum,
  verifyAllowlist,
  verifySnapshot,
  verifyPostconditions,
  canStartRun,
  resolveCommittedRetry,
  evaluateGlobalWriteGate,
  buildK2bSql,
  buildReleaseSql,
  validateRunId,
  runK2b,
}

if (require.main === module) {
  const args = new Set(process.argv.slice(2))
  const runId = process.env.K2_RUN_ID
  const result = runK2b({
    poolerUrl: process.env.K2_POOLER_URL || process.env.DATABASE_URL,
    runId,
    execute: args.has('--execute-k2b'),
    confirmation: args.has('--confirm-k2b'),
    state: {
      r1Pass: process.env.K2_R1_PASS === 'true',
      snapshotPass: process.env.K2_SNAPSHOT_PASS === 'true',
      dryRunPass: process.env.K2_DRY_RUN_PASS === 'true',
      rollbackPass: process.env.K2_ROLLBACK_PASS === 'true',
      writersControlled: process.env.K2_WRITERS_CONTROLLED === 'true',
      invariantsPass: process.env.K2_INVARIANTS_PASS === 'true',
      serviceRole: process.env.K2_SERVICE_ROLE === 'service_role',
    },
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = result.status === 'COMMITTED' ? 0 : 1
}
