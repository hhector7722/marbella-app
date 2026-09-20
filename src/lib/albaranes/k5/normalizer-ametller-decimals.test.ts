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

function ametllerArtifact() {
  return {
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

              cell(1, 0, '41461'),
              cell(1, 1, 'L092615C03B AtunAceite Bolsa 1Kg'),
              cell(1, 2, '4.000UNI'),
              cell(1, 3, '6,660'),
              cell(1, 4, '26,64'),
              cell(1, 5, '10,00%'),

              cell(2, 0, '206'),
              cell(2, 1, 'A02260915 CebollaRoja'),
              cell(2, 2, '1.300KG'),
              cell(2, 3, '1,550'),
              cell(2, 4, '2,02'),
              cell(2, 5, '4,00%'),

              cell(3, 0, '157'),
              cell(3, 1, 'A403D260915 Tomate Pera Extra'),
              cell(3, 2, '10,100KG'),
              cell(3, 3, '4,990'),
              cell(3, 4, '50,40'),
              cell(3, 5, '4,00%'),
            ],
          },
        }],
      },
    },
  }
}

function atunMapping(id: string, supplierItemName: string, ingredientId = 'atun'): K5MappingSnapshot {
  return {
    id,
    supplierItemName,
    ingredientId,
    conversionFactor: '1',
    lineBillingUnit: 'ud',
    lineContentQty: '1',
    lineContentUnit: 'kg',
    purchaseUnit: 'kg',
    baseUnit: 'g',
  }
}

test('Ametller no hereda falsos line_amount_mismatch del intérprete Number cuando K5 exacto concilia', () => {
  const profile = supplierProfileForId(1)
  assert.ok(profile)

  const result = normalizeDoclingEvidence({
    profile,
    rawArtifact: ametllerArtifact(),
    supplierId: 1,
    mappings: [],
  })

  assert.equal(result.normalizerVersion, 'k5-normalizer-v6')
  assert.equal(result.proposals.length, 3)

  const byName = new Map(result.proposals.map((proposal) => [proposal.sourceItemName, proposal]))
  const atun = byName.get('L092615C03B AtunAceite Bolsa 1Kg')!
  const cebolla = byName.get('A02260915 CebollaRoja')!
  const tomate = byName.get('A403D260915 Tomate Pera Extra')!

  assert.equal(atun.lineQuantity, '4')
  assert.equal(atun.observedUnitPrice, '6.66')
  assert.equal(atun.lineTotal, '26.64')
  assert.equal(atun.status, 'needs_mapping')
  assert.deepEqual(atun.reviewReasons, ['mapping_missing'])

  assert.equal(cebolla.lineQuantity, '1.3')
  assert.equal(cebolla.observedUnitPrice, '1.55')
  assert.equal(cebolla.lineTotal, '2.02')
  assert.equal(cebolla.status, 'needs_mapping')
  assert.deepEqual(cebolla.reviewReasons, ['mapping_missing'])

  assert.equal(tomate.lineQuantity, '10.1')
  assert.equal(tomate.observedUnitPrice, '4.99')
  assert.equal(tomate.lineTotal, '50.4')
  assert.equal(tomate.status, 'needs_mapping')
  assert.deepEqual(tomate.reviewReasons, ['mapping_missing'])
})

test('Ametller reutiliza un mapping confirmado aunque cambie el prefijo técnico del producto', () => {
  const profile = supplierProfileForId(1)
  assert.ok(profile)

  const result = normalizeDoclingEvidence({
    profile,
    rawArtifact: ametllerArtifact(),
    supplierId: 1,
    mappings: [atunMapping('mapping-old-prefix', 'L082515C03B AtunAceite Bolsa 1Kg')],
  })
  const atun = result.proposals.find((proposal) => proposal.sourceItemName?.includes('AtunAceite'))!
  assert.equal(atun.mappingVersionId, 'mapping-old-prefix')
  assert.equal(atun.ingredientId, 'atun')
  assert.equal(atun.status, 'ready_for_review')
  assert.equal(atun.purchaseQuantity, '4')
  assert.equal(atun.physicalQuantity, '4000')
  assert.equal(atun.normalizedUnitPrice, '6.66')
})

test('Ametller tolera duplicados semánticamente iguales pero bloquea mappings canónicos en conflicto', () => {
  const profile = supplierProfileForId(1)
  assert.ok(profile)

  const same = normalizeDoclingEvidence({
    profile,
    rawArtifact: ametllerArtifact(),
    supplierId: 1,
    mappings: [
      atunMapping('mapping-a', 'L082515C03B AtunAceite Bolsa 1Kg'),
      atunMapping('mapping-b', 'L072415C03B AtunAceite Bolsa 1Kg'),
    ],
  })
  assert.equal(same.proposals.find((proposal) => proposal.sourceItemName?.includes('AtunAceite'))!.status, 'ready_for_review')

  const conflict = normalizeDoclingEvidence({
    profile,
    rawArtifact: ametllerArtifact(),
    supplierId: 1,
    mappings: [
      atunMapping('mapping-a', 'L082515C03B AtunAceite Bolsa 1Kg'),
      atunMapping('mapping-conflict', 'L072415C03B AtunAceite Bolsa 1Kg', 'otro-atun'),
    ],
  })
  const atun = conflict.proposals.find((proposal) => proposal.sourceItemName?.includes('AtunAceite'))!
  assert.equal(atun.status, 'needs_mapping')
  assert.deepEqual(atun.reviewReasons, ['mapping_missing'])
})
