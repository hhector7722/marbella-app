import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duplicatedPageEvidence } from './duplicate-page-evidence.ts'

const line = (name: string) => ({
  description_raw: name, quantity_raw: '2', billing_unit_raw: 'ud',
  unit_price_raw: '4.50', line_total_raw: '9.00',
})

test('detecta fotos diferentes de la misma hoja, sin borrar su evidencia', () => {
  const repeated = duplicatedPageEvidence([
    { pageKey: 'foto-1', lines: [line('CERVEZA ALHAMBRA'), line('AGUA')] },
    { pageKey: 'foto-2', lines: [line('CERVEZA ALHAMBRA'), line('AGUA')] },
  ])
  assert.deepEqual(repeated, [{
    originalPageKey: 'foto-1', repeatedPageKey: 'foto-2', lineCount: 2,
  }])
})

test('dos hojas con cualquier dato económico distinto no se deduplican', () => {
  assert.deepEqual(duplicatedPageEvidence([
    { pageKey: 'foto-1', lines: [line('AGUA')] },
    { pageKey: 'foto-2', lines: [{ ...line('AGUA'), quantity_raw: '3' }] },
  ]), [])
})

test('las hojas sin líneas no se consideran duplicadas por sí solas', () => {
  assert.deepEqual(duplicatedPageEvidence([
    { pageKey: 'foto-1', lines: [] },
    { pageKey: 'foto-2', lines: [] },
  ]), [])
})

test('detecta contenido idéntico aunque el orden OCR cambie', () => {
  assert.equal(duplicatedPageEvidence([
    { pageKey: 'a', lines: [line('agua'), line('CERVEZA')] },
    { pageKey: 'b', lines: [line('CERVEZA'), line('AGUA')] },
  ]).length, 1)
})
