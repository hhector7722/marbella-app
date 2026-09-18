import assert from 'node:assert/strict'
import test from 'node:test'
import { supplierProfileForId } from './profile-registry.ts'
import { normalizeDoclingEvidence, type K5MappingSnapshot } from './normalizer.ts'

function cell(row: number, column: number, text: string, columnHeader = false) {
  return {
    start_row_offset_idx: row,
    start_col_offset_idx: column,
    row_span: 1,
    col_span: 1,
    text,
    column_header: columnHeader,
  }
}

test('Ametller BOL queda listo cuando un mapping humano confirmado define bolsa de 500 g', () => {
  const profile = supplierProfileForId(1)
  assert.ok(profile)

  const rawArtifact = {
    document: {
      text_content: 'Ametller Origen S.L.',
      json_content: {
        tables: [{
          data: {
            table_cells: [
              cell(0, 0, 'Código', true),
              cell(0, 1, 'Descripción', true),
              cell(0, 2, 'Cantidad', true),
              cell(0, 3, 'Precio', true),
              cell(0, 4, 'Importe', true),
              cell(0, 5, '%IVA', true),
              cell(1, 0, '42019'),
              cell(1, 1, 'B260915Ensalada Mezclum7Brotes Bolsa 500g'),
              cell(1, 2, '3,000 BOL'),
              cell(1, 3, '4,490'),
              cell(1, 4, '13,47'),
              cell(1, 5, '4,00%'),
            ],
          },
        }],
      },
    },
  }

  const mapping: K5MappingSnapshot = {
    id: 'mezclum-confirmed',
    supplierItemName: 'B250814Ensalada Mezclum7Brotes Bolsa 500g',
    ingredientId: 'mezclum',
    conversionFactor: '0.5',
    lineBillingUnit: 'bag',
    lineContentQty: '500',
    lineContentUnit: 'g',
    purchaseUnit: 'kg',
    baseUnit: 'g',
  }

  const result = normalizeDoclingEvidence({ profile, rawArtifact, supplierId: 1, mappings: [mapping] })
  assert.equal(result.normalizerVersion, 'k5-normalizer-v5')
  assert.equal(result.proposals.length, 1)
  const line = result.proposals[0]!
  assert.equal(line.status, 'ready_for_review')
  assert.deepEqual(line.reviewReasons, [])
  assert.equal(line.mappingVersionId, 'mezclum-confirmed')
  assert.equal(line.lineUnit, 'bag')
  assert.equal(line.purchaseQuantity, '1.5')
  assert.equal(line.physicalQuantity, '1500')
  assert.equal(line.normalizedUnitPrice, '8.98')
})
