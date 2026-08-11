const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const test = require('node:test')

const allowlistPath = 'sql/diagnostics/k2/2026-08-11-k2b-allowlist.json'

function readAllowlist() {
  return JSON.parse(fs.readFileSync(allowlistPath, 'utf8'))
}

function checksum(entries) {
  const lines = entries
    .map((entry) => [
      entry.table,
      entry.primary_key_column,
      entry.primary_key_value,
      entry.column,
      JSON.stringify(entry.before_value),
      JSON.stringify(entry.expected_value),
    ].join('\t'))
    .sort()
  return crypto
    .createHash('sha256')
    .update(`k2b-allowlist-v1\n${lines.join('\n')}\n`)
    .digest('hex')
}

test('A: 40 filas se expanden a 71 operaciones', () => {
  const allowlist = readAllowlist()
  const rows = new Set(allowlist.operations.map((entry) => `${entry.table}|${entry.primary_key_value}`))
  assert.equal(rows.size, 40)
  assert.equal(allowlist.operations.length, 71)
})

test('B: no hay operaciones duplicadas', () => {
  const { operations } = readAllowlist()
  const keys = operations.map((entry) => `${entry.table}|${entry.primary_key_value}|${entry.column}`)
  assert.equal(new Set(keys).size, operations.length)
})

test('C: todas las operaciones tienen PK y before', () => {
  const { operations } = readAllowlist()
  for (const entry of operations) {
    assert.ok(entry.primary_key_value)
    assert.ok(['u', 'unitat'].includes(entry.before_value))
  }
})

test('D: todos los targets son el canonico de conteo', () => {
  const { operations } = readAllowlist()
  for (const entry of operations) assert.equal(entry.expected_value, 'ud')
})

test('E: no hay dimensiones, presentations ni ambiguos', () => {
  const { operations } = readAllowlist()
  for (const entry of operations) {
    assert.ok(['public.ingredients', 'public.recipe_ingredients'].includes(entry.table))
    assert.ok(['purchase_unit', 'unit_type', 'unit'].includes(entry.column))
    assert.ok(['u_to_ud', 'unitat_to_ud'].includes(entry.normalization_rule))
  }
})

test('F: checksum reproducible', () => {
  const allowlist = readAllowlist()
  assert.equal(checksum(allowlist.operations), allowlist.allowlist_checksum)
})

test('G: cambiar before invalida el checksum', () => {
  const allowlist = readAllowlist()
  const changed = allowlist.operations.map((entry, index) => index === 0 ? { ...entry, before_value: 'ud' } : entry)
  assert.notEqual(checksum(changed), allowlist.allowlist_checksum)
})

test('H: cambiar expected invalida el checksum', () => {
  const allowlist = readAllowlist()
  const changed = allowlist.operations.map((entry, index) => index === 0 ? { ...entry, expected_value: 'kg' } : entry)
  assert.notEqual(checksum(changed), allowlist.allowlist_checksum)
})

test('I: anadir una operacion invalida el checksum', () => {
  const allowlist = readAllowlist()
  const changed = [...allowlist.operations, { ...allowlist.operations[0], column: 'recipe_unit' }]
  assert.notEqual(checksum(changed), allowlist.allowlist_checksum)
})

test('J: eliminar una operacion invalida el checksum', () => {
  const allowlist = readAllowlist()
  assert.notEqual(checksum(allowlist.operations.slice(0, -1)), allowlist.allowlist_checksum)
})
