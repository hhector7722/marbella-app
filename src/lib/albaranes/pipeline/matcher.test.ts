import assert from 'node:assert/strict'
import test from 'node:test'
import { matchSupplierProduct, normalizeSupplierText, type SupplierProductMemory } from './matcher.ts'

const memory: SupplierProductMemory[] = [
  { supplierId: 7, ingredientId: 'cola', supplierProductCode: 'C12', observedName: 'COCA COLA ZERO', mappingVersionId: 'm1', trustedPresentation: true },
  { supplierId: 7, ingredientId: 'beer', supplierProductCode: null, observedName: 'ESTRELLA LATA DAMM', mappingVersionId: 'm2', trustedPresentation: true },
  { supplierId: 7, ingredientId: 'beer-alt', supplierProductCode: null, observedName: 'ESTRELLA BOTELLA DAMM', mappingVersionId: 'm3', trustedPresentation: true },
]

test('prioriza código de proveedor único incluso con OCR imperfecto', () => {
  const match = matchSupplierProduct({ supplierId: 7, productCode: 'C12', description: 'GOCA COLA ZERO', memory })
  assert.equal(match.ingredientId, 'cola')
  assert.equal(match.source, 'code')
})

test('recupera alias con un carácter OCR errado y conserva la presentación validada', () => {
  const match = matchSupplierProduct({ supplierId: 7, productCode: null, description: 'GOCA COLA ZERO', memory })
  assert.equal(match.ingredientId, 'cola')
  assert.equal(match.mappingVersionId, 'm1')
  assert.equal(match.source, 'fuzzy')
})

test('el mismo código no reutiliza una presentación con otra cantidad', () => {
  const match = matchSupplierProduct({ supplierId: 7, productCode: 'C12',
    description: 'COCA COLA ZERO CAJA 12',
    memory: [{ ...memory[0]!, observedName: 'COCA COLA ZERO CAJA 6' }] })
  assert.equal(match.ingredientId, null)
})

test('dos presentaciones verificadas con el mismo nombre quedan ambiguas', () => {
  const match = matchSupplierProduct({ supplierId: 7, productCode: 'C12',
    description: 'COCA COLA ZERO', memory: [
      { ...memory[0]!, presentationSignature: '6|caja|6|ud' },
      { ...memory[0]!, mappingVersionId: 'm4', presentationSignature: '12|caja|12|ud' },
    ] })
  assert.equal(match.source, 'ambiguous')
})

test('normaliza cero y letra O en códigos de presentación', () => {
  assert.equal(normalizeSupplierText('1OOun'), normalizeSupplierText('100un'))
})

test('no selecciona un producto cuando dos ingredientes tienen el mismo alias', () => {
  const ambiguous = [...memory, { ...memory[0]!, ingredientId: 'another', mappingVersionId: 'm4' }]
  assert.equal(matchSupplierProduct({ supplierId: 7, productCode: 'C12', description: 'GOCA COLA ZERO', memory: ambiguous }).source, 'ambiguous')
})

test('otro proveedor no hereda identidades', () => {
  assert.equal(matchSupplierProduct({ supplierId: 8, productCode: 'C12', description: 'COCA COLA ZERO', memory }).ingredientId, null)
})

test('detecta conflicto real entre alias simple y alias con lote técnico', () => {
  const conflicting: SupplierProductMemory[] = [
    { supplierId: 1, ingredientId: 'aquarius', supplierProductCode: null,
      observedName: 'Naranja Postre', mappingVersionId: 'legacy-import', trustedPresentation: true },
    { supplierId: 1, ingredientId: 'naranja', supplierProductCode: null,
      observedName: 'A4051260915 Naranja Postre', mappingVersionId: 'confirmed', trustedPresentation: true },
  ]
  const match = matchSupplierProduct({ supplierId: 1, productCode: null,
    description: 'Naranja Postre', memory: conflicting })
  assert.equal(match.source, 'ambiguous')
  assert.equal(match.ingredientId, null)
})
