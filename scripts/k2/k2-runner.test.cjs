/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')

const {
  ALLOWLIST_PATH,
  EXPECTED_ALLOWLIST_CHECKSUM,
  EXPECTED_SNAPSHOT_CHECKSUM,
  buildK2bSql,
  canStartRun,
  evaluateGlobalWriteGate,
  loadApprovedAllowlist,
  resolveCommittedRetry,
  runK2b,
  verifyAllowlist,
  verifyExpectedChecksum,
  verifyPostconditions,
  verifySnapshot,
} = require('./k2-runner.cjs')

const allowlist = loadApprovedAllowlist(ALLOWLIST_PATH)
const baseState = {
  r1Pass: true,
  allowlistPass: true,
  snapshotPass: true,
  dryRunPass: true,
  rollbackPass: true,
  writersControlled: true,
  invariantsPass: true,
  serviceRole: true,
}

test('A: checksum correcto pasa', () => {
  assert.equal(verifyExpectedChecksum(EXPECTED_ALLOWLIST_CHECKSUM, EXPECTED_ALLOWLIST_CHECKSUM).status, 'PASS')
})

test('B: checksum incorrecto bloquea', () => {
  assert.equal(verifyExpectedChecksum('bad', EXPECTED_ALLOWLIST_CHECKSUM).status, 'K2_WRITE_BLOCKED')
})

test('C: count incorrecto bloquea', () => {
  assert.equal(verifyAllowlist({ ...allowlist, counts: { ...allowlist.counts, allowlist_operations: 70 } }).status, 'K2_WRITE_BLOCKED')
})

test('D: before correcto pasa la validacion de entradas aprobadas', () => {
  assert.equal(allowlist.operations.every(entry => entry.before_value === 'u' || entry.before_value === 'unitat'), true)
})

test('E: before alterado bloquea', () => {
  const changed = { ...allowlist, operations: allowlist.operations.map((entry, i) => i === 0 ? { ...entry, before_value: 'ud' } : entry) }
  assert.equal(verifyAllowlist(changed).status, 'K2_WRITE_BLOCKED')
})

test('F: expected alterado bloquea', () => {
  const changed = { ...allowlist, operations: allowlist.operations.map((entry, i) => i === 0 ? { ...entry, expected_value: 'kg' } : entry) }
  assert.equal(verifyAllowlist(changed).status, 'K2_WRITE_BLOCKED')
})

test('G: operacion fuera de allowlist bloquea', () => {
  const changed = { ...allowlist, operations: [...allowlist.operations, { ...allowlist.operations[0], column: 'current_price' }] }
  assert.equal(verifyAllowlist(changed).status, 'K2_WRITE_BLOCKED')
})

test('H: operacion duplicada bloquea', () => {
  const changed = { ...allowlist, operations: [...allowlist.operations, allowlist.operations[0]] }
  assert.equal(verifyAllowlist(changed).status, 'K2_WRITE_BLOCKED')
})

test('I: anon/authenticated no pueden pasar el gate de service_role', () => {
  assert.equal(evaluateGlobalWriteGate({ ...baseState, serviceRole: false }).status, 'K2_WRITE_BLOCKED')
})

test('J: run_id invalido bloquea', () => {
  assert.equal(runK2b({ runId: 'bad', state: baseState, execute: false }).reasons[0], 'RUN_ID_INVALID')
})

test('K: freeze inactivo bloquea', () => {
  assert.equal(evaluateGlobalWriteGate({ ...baseState, freezeActive: false, transactionAuthorized: true }, 'write').status, 'K2_WRITE_BLOCKED')
})

test('L: freeze activo y autorizacion valida autorizan', () => {
  assert.equal(evaluateGlobalWriteGate({ ...baseState, freezeActive: true, transactionAuthorized: true }, 'write').status, 'K2_WRITE_AUTHORIZED')
})

test('M: snapshot aprobado pasa', () => {
  const snapshot = JSON.parse(fs.readFileSync('sql/diagnostics/k2/2026-08-10-k2-snapshot-37f7157a.json', 'utf8'))
  assert.equal(verifySnapshot(snapshot).status, 'PASS')
  assert.equal(snapshot.checksum_sha256, EXPECTED_SNAPSHOT_CHECKSUM)
})

test('N: postcondition 71/71 pasa', () => {
  const actual = allowlist.operations.map(entry => ({ ...entry, value: entry.expected_value }))
  assert.equal(verifyPostconditions(allowlist, actual).status, 'PASS')
})

test('O: postcondition 70/71 bloquea', () => {
  const actual = allowlist.operations.slice(0, -1).map(entry => ({ ...entry, value: entry.expected_value }))
  assert.equal(verifyPostconditions(allowlist, actual).status, 'K2_WRITE_BLOCKED')
})

test('P: SQL mantiene una operacion restringida por PK, before y postconditions en fases', () => {
  const sql = buildK2bSql(allowlist, '00000000-0000-4000-8000-000000000001')
  assert.equal((sql.match(/K2_WRITE_NOT_APPLIED/g) ?? []).length, 71)
  assert.equal((sql.match(/K2_BEFORE_CONFLICT/g) ?? []).length, 71)
  assert.equal((sql.match(/K2_POSTCONDITION_FAIL/g) ?? []).length, 71)
})

test('Q: error de ejecucion no se activa sin modo execute y confirmacion', () => {
  const result = runK2b({ runId: '00000000-0000-4000-8000-000000000001', state: baseState, execute: false, confirmation: false })
  assert.equal(result.status, 'K2_WRITE_BLOCKED')
})

test('R: retry de COMMITTED no escribe', () => {
  const result = resolveCommittedRetry({ status: 'COMMITTED', allowlist_checksum: 'a', snapshot_checksum: 'b' }, 'a', 'b')
  assert.deepEqual(result, { status: 'COMMITTED', idempotent: true, wrote: false })
})

test('S: WRITING no se reintenta automaticamente', () => {
  assert.equal(canStartRun('WRITING').status, 'K2_WRITE_BLOCKED')
})

test('T: datos fuera de allowlist no aparecen en el SQL K2b', () => {
  const sql = buildK2bSql(allowlist, '00000000-0000-4000-8000-000000000001')
  assert.doesNotMatch(sql, /current_price|supplier_item_mappings|stock/)
})

test('U: la allowlist actual se acepta con el checksum aprobado', () => {
  assert.equal(verifyAllowlist(allowlist).status, 'PASS')
})
