import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupplierProfile } from '../supplier-profiles/types.ts'
import { normalizeDoclingEvidence } from './normalizer.ts'

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

function artifact(headers: string[], values: string[], issuer: string) {
  return {
    document: {
      text_content: issuer,
      json_content: {
        tables: [{
          data: {
            table_cells: [
              ...headers.map((header, index) => cell(0, index, header, true)),
              ...values.map((value, index) => cell(1, index, value)),
            ],
          },
        }],
      },
    },
  }
}

const panabadProfile: SupplierProfile = {
  schema_version: 1,
  id: 'supplier:2:panabad',
  version: '1.0.0',
  supplier: {
    id: 2,
    canonical_name: 'Panabad',
    aliases: ['Panabad S.A.'],
    observed_document_identities: ['Panabad'],
  },
  reference: { file: '../Panabad.png', sha256: '0'.repeat(64) },
  document_formats: [{ id: 'panabad', description: 'cajas y descuento' }],
  fields: {
    product: { aliases: ['Descripció'], meaning: 'producto y Uds/caja' },
    quantity: { aliases: ['Lliurat'], meaning: 'cajas' },
    unit_price: { aliases: ['Preu'], meaning: 'EUR/caja antes de descuento' },
    discount_percent: { aliases: ['%'], meaning: 'descuento porcentual' },
    line_amount: { aliases: ['Import'], meaning: 'importe neto' },
  },
  interpretation: {
    kind: 'case_discount',
    price_unit: 'EUR/unit',
    amount_tax_basis: 'without_tax',
    units_per_case_from_description: true,
    rounding_tolerance: 0.01,
  },
  needs_review: [],
  examples: [],
}

const nestleProfile: SupplierProfile = {
  ...panabadProfile,
  id: 'supplier:10:nestle',
  supplier: {
    id: 10,
    canonical_name: 'Nestle',
    aliases: ['Nestlé'],
    observed_document_identities: ['Nestlé'],
  },
  fields: {
    quantity: { aliases: ['Cantidad'], meaning: 'cajas' },
    product: { aliases: ['Producto'], meaning: 'producto, unidades por caja y contenido' },
    unit_price: { aliases: ['Precio'], meaning: 'EUR/caja antes de descuento' },
    discount_percent: { aliases: ['%Dto'], meaning: 'descuento porcentual' },
    line_amount: { aliases: ['Precio con descuento'], meaning: 'importe neto' },
  },
  interpretation: {
    kind: 'case_discount',
    price_unit: 'EUR/unit',
    amount_tax_basis: 'without_tax',
    units_per_case_from_description: true,
    content_per_unit_from_description: true,
    rounding_tolerance: 0.01,
  },
}

test('Panabad conserva caja como unidad facturada aunque Docling omita CAJA', () => {
  const raw = artifact(
    ['Descripció', 'Lliurat', 'Preu', '%', 'Import'],
    ['BOCATA MEDITERRANEO - 60 Uds.', '8,000', '33,86', '38,00', '167,95'],
    'PANABAD S.A.'
  )

  const proposal = normalizeDoclingEvidence({
    profile: panabadProfile,
    rawArtifact: raw,
    supplierId: 2,
    mappings: [{
      id: 'mapping-panabad',
      supplierItemName: 'BOCATA MEDITERRANEO - 60 Uds.',
      ingredientId: 'ingredient-panabad',
      conversionFactor: '60',
      lineBillingUnit: 'case',
      lineContentQty: '60',
      lineContentUnit: 'ud',
      purchaseUnit: 'ud',
      baseUnit: 'ud',
    }],
  }).proposals[0]!

  assert.equal(proposal.status, 'ready_for_review')
  assert.equal(proposal.mappingVersionId, 'mapping-panabad')
  assert.equal(proposal.lineUnit, 'case')
  assert.equal(proposal.lineQuantity, '8')
  assert.equal(proposal.observedUnitPrice, '20.99375')
  assert.equal(proposal.purchaseQuantity, '480')
  assert.equal(proposal.physicalQuantity, '480')
  assert.equal(proposal.normalizedUnitPrice, '0.34989583')
  assert.deepEqual(proposal.reviewReasons, [])
})

test('Nestlé conserva CJ como caja aunque Docling deje Cantidad sin sufijo', () => {
  const raw = artifact(
    ['Cantidad', 'Producto', 'Precio', '%Dto', 'Precio con descuento'],
    ['2,00', 'PIRULO TROPICAL N1 20 70ml', '27,000', '20,00', '43,20'],
    'HELADOS NESTLÉ'
  )

  const proposal = normalizeDoclingEvidence({
    profile: nestleProfile,
    rawArtifact: raw,
    supplierId: 10,
    mappings: [{
      id: 'mapping-nestle',
      supplierItemName: 'PIRULO TROPICAL N1 20 70ml',
      ingredientId: 'ingredient-nestle',
      conversionFactor: '20',
      lineBillingUnit: 'case',
      lineContentQty: '20',
      lineContentUnit: 'ud',
      purchaseUnit: 'ud',
      baseUnit: 'ud',
    }],
  }).proposals[0]!

  assert.equal(proposal.status, 'ready_for_review')
  assert.equal(proposal.mappingVersionId, 'mapping-nestle')
  assert.equal(proposal.lineUnit, 'case')
  assert.equal(proposal.lineQuantity, '2')
  assert.equal(proposal.observedUnitPrice, '21.6')
  assert.equal(proposal.purchaseQuantity, '40')
  assert.equal(proposal.physicalQuantity, '40')
  assert.equal(proposal.normalizedUnitPrice, '1.08')
  assert.deepEqual(proposal.reviewReasons, [])
})
