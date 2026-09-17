import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyK5BatchCandidate, k5EvidenceIdentity } from './batch-review.ts'

const base = {
  status: 'ready_for_review',
  mappingVersionId: 'mapping-1',
  ingredientId: 'ingredient-1',
  lineId: 'line-1',
  confirmed: false,
  pendingOrderCount: 0,
}

test('solo una línea lista, completa y sin pedido pendiente entra en lote', () => {
  assert.equal(classifyK5BatchCandidate(base), 'ready')
})

test('una línea ya confirmada nunca vuelve a entrar en lote', () => {
  assert.equal(classifyK5BatchCandidate({ ...base, confirmed: true }), 'confirmed')
})

test('mapping y revisión pendientes quedan fuera del lote automático', () => {
  assert.equal(classifyK5BatchCandidate({ ...base, status: 'needs_mapping' }), 'needs_mapping')
  assert.equal(classifyK5BatchCandidate({ ...base, status: 'needs_review' }), 'needs_review')
})

test('un pedido pendiente obliga a revisar esa línea de forma individual', () => {
  assert.equal(classifyK5BatchCandidate({ ...base, pendingOrderCount: 2 }), 'order_review')
})

test('nunca inventa mapping, ingrediente o línea ausentes', () => {
  assert.equal(classifyK5BatchCandidate({ ...base, mappingVersionId: null }), 'unavailable')
  assert.equal(classifyK5BatchCandidate({ ...base, ingredientId: null }), 'unavailable')
  assert.equal(classifyK5BatchCandidate({ ...base, lineId: null }), 'unavailable')
})

test('la identidad de evidencia une revisiones de la misma fila Docling', () => {
  assert.equal(
    k5EvidenceIdentity({ documentExtractionId: 'ext-1', sourceTableIndex: 0, sourceRowIndex: 8 }),
    'ext-1:0:8'
  )
  assert.equal(
    k5EvidenceIdentity({ documentExtractionId: 'ext-1', sourceTableIndex: 0, sourceRowIndex: 9 }),
    'ext-1:0:9'
  )
})

test('no fabrica identidad de evidencia si faltan coordenadas exactas', () => {
  assert.equal(k5EvidenceIdentity({ documentExtractionId: '', sourceTableIndex: 0, sourceRowIndex: 8 }), null)
  assert.equal(k5EvidenceIdentity({ documentExtractionId: 'ext-1', sourceTableIndex: null, sourceRowIndex: 8 }), null)
  assert.equal(k5EvidenceIdentity({ documentExtractionId: 'ext-1', sourceTableIndex: 0, sourceRowIndex: -1 }), null)
})
