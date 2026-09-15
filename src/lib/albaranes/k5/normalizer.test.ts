import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupplierProfile } from '../supplier-profiles/types.ts'
import { normalizeDoclingEvidence } from './normalizer.ts'

function cell(row: number, column: number, text: string, columnHeader = false, colSpan = 1) {
  return {
    start_row_offset_idx: row,
    start_col_offset_idx: column,
    row_span: 1,
    col_span: colSpan,
    text,
    column_header: columnHeader,
  }
}

function artifact(tables: unknown[], text = 'Proveedor Test') {
  return {
    document: {
      text_content: text,
      json_content: { tables },
    },
  }
}

const directProfile: SupplierProfile = {
  schema_version: 1,
  id: 'supplier:999:test',
  version: '1.0.0',
  supplier: {
    id: 999,
    canonical_name: 'Proveedor Test',
    aliases: [],
    observed_document_identities: ['Proveedor Test'],
  },
  reference: { file: '../test.png', sha256: '0'.repeat(64) },
  document_formats: [{ id: 'test', description: 'fixture' }],
  fields: {
    product: { aliases: ['Producto'], meaning: 'producto' },
    quantity: { aliases: ['Cantidad'], meaning: 'kg' },
    unit_price: { aliases: ['Precio'], meaning: 'EUR/kg' },
    line_amount: { aliases: ['Importe'], meaning: 'neto' },
  },
  interpretation: {
    kind: 'direct_line',
    quantity_unit: 'kg',
    accepted_quantity_units: ['kg'],
    price_unit: 'EUR/kg',
    amount_tax_basis: 'without_tax',
    rounding_tolerance: 0.01,
  },
  needs_review: [],
  examples: [],
}

test('mapping confirmado y presentación exacta producen ready_for_review', () => {
  const raw = artifact([{
    data: {
      table_cells: [
        cell(0, 0, 'Producto', true),
        cell(0, 1, 'Cantidad', true),
        cell(0, 2, 'Precio', true),
        cell(0, 3, 'Importe', true),
        cell(1, 0, 'CALAMAR'),
        cell(1, 1, '15,60 KG'),
        cell(1, 2, '9,75'),
        cell(1, 3, '152,10'),
      ],
    },
  }])

  const result = normalizeDoclingEvidence({
    profile: directProfile,
    rawArtifact: raw,
    supplierId: 999,
    mappings: [{
      id: 'mapping-1',
      supplierItemName: 'CALAMAR',
      ingredientId: 'ingredient-1',
      conversionFactor: '1',
      lineBillingUnit: 'kg',
      lineContentQty: '1',
      lineContentUnit: 'kg',
      purchaseUnit: 'kg',
      baseUnit: 'g',
    }],
  })

  assert.equal(result.proposals.length, 1)
  const proposal = result.proposals[0]!
  assert.equal(proposal.status, 'ready_for_review')
  assert.equal(proposal.lineQuantity, '15.6')
  assert.equal(proposal.observedUnitPrice, '9.75')
  assert.equal(proposal.lineTotal, '152.1')
  assert.equal(proposal.purchaseQuantity, '15.6')
  assert.equal(proposal.physicalQuantity, '15600')
  assert.equal(proposal.normalizedUnitPrice, '9.75')
  assert.deepEqual(proposal.reviewReasons, [])
})

test('sin mapping seguro no inventa factor 1', () => {
  const raw = artifact([{
    data: {
      table_cells: [
        cell(0, 0, 'Producto', true),
        cell(0, 1, 'Cantidad', true),
        cell(0, 2, 'Precio', true),
        cell(0, 3, 'Importe', true),
        cell(1, 0, 'CALAMAR'),
        cell(1, 1, '15,60 KG'),
        cell(1, 2, '9,75'),
        cell(1, 3, '152,10'),
      ],
    },
  }])

  const proposal = normalizeDoclingEvidence({
    profile: directProfile,
    rawArtifact: raw,
    supplierId: 999,
    mappings: [],
  }).proposals[0]!

  assert.equal(proposal.status, 'needs_mapping')
  assert.equal(proposal.mappingVersionId, null)
  assert.equal(proposal.purchaseQuantity, null)
  assert.ok(proposal.reviewReasons.includes('mapping_missing'))
})

test('mapping de presentación incompatible queda bloqueado', () => {
  const raw = artifact([{
    data: {
      table_cells: [
        cell(0, 0, 'Producto', true),
        cell(0, 1, 'Cantidad', true),
        cell(0, 2, 'Precio', true),
        cell(0, 3, 'Importe', true),
        cell(1, 0, 'CALAMAR'),
        cell(1, 1, '15,60 KG'),
        cell(1, 2, '9,75'),
        cell(1, 3, '152,10'),
      ],
    },
  }])

  const proposal = normalizeDoclingEvidence({
    profile: directProfile,
    rawArtifact: raw,
    supplierId: 999,
    mappings: [{
      id: 'mapping-unit',
      supplierItemName: 'CALAMAR',
      ingredientId: 'ingredient-1',
      conversionFactor: '1',
      lineBillingUnit: 'ud',
      lineContentQty: '1',
      lineContentUnit: 'ud',
      purchaseUnit: 'ud',
      baseUnit: 'ud',
    }],
  }).proposals[0]!

  assert.equal(proposal.status, 'needs_mapping')
  assert.equal(proposal.mappingVersionId, null)
})

test('Videla conserva medidas coexistentes, respeta cabeceras solapadas y fuerza needs_review', () => {
  const videlaProfile: SupplierProfile = {
    ...directProfile,
    id: 'supplier:3:videla',
    supplier: {
      id: 3,
      canonical_name: 'Videla',
      aliases: ['Pescados Videla'],
      observed_document_identities: ['Pescados Videla S.A.'],
    },
    fields: {
      product: { aliases: ['Artículo'], meaning: 'producto' },
      tare: { aliases: ['Tara'], meaning: 'tara' },
      quantity: { aliases: ['Unidades'], meaning: 'PZ/BU/KG' },
      unit_price: { aliases: ['Precio'], meaning: 'precio' },
      line_amount: { aliases: ['Importe'], meaning: 'importe' },
      tax_percent: { aliases: ['%Iva'], meaning: 'IVA' },
    },
    interpretation: { kind: 'mixed_measure_review', rounding_tolerance: 0.01 },
    needs_review: ['medidas coexistentes'],
  }

  const raw = artifact([
    {
      data: {
        table_cells: [
          cell(0, 0, 'Artículo', true),
          cell(1, 0, 'CALAMAR CONG.... CROQUETA COCIDO ENTRANA'),
        ],
      },
    },
    {
      data: {
        table_cells: [
          cell(0, 0, '%Iva', true),
          // Replica el Docling real de Videla: `Unidades` abarca también las
          // columnas donde existen celdas explícitas `Precio` e `Importe`.
          cell(0, 1, 'Unidades', true, 4),
          cell(0, 3, 'Precio', true),
          cell(0, 4, 'Importe', true),
          cell(1, 0, '10'),
          cell(1, 1, '3,00BU'),
          cell(1, 2, '15,60 KG'),
          cell(1, 3, '9,75'),
          cell(1, 4, '152,10'),
        ],
      },
    },
  ], 'Pescados Videla S.A.')

  const result = normalizeDoclingEvidence({
    profile: videlaProfile,
    rawArtifact: raw,
    supplierId: 3,
    mappings: [],
  })

  const proposal = result.proposals[0]!
  assert.equal(proposal.status, 'needs_review')
  assert.equal(proposal.sourceItemName, null)
  assert.equal(proposal.observedUnitPrice, '9.75')
  assert.equal(proposal.lineTotal, '152.1')
  assert.ok(proposal.reviewReasons.includes('mixed_measurement_requires_review'))
  assert.ok(proposal.warnings.some((warning) => warning.includes('3,00BU') && warning.includes('15,60 KG')))
  assert.equal(proposal.mappingVersionId, null)
  assert.equal(proposal.normalizedUnitPrice, null)
})
