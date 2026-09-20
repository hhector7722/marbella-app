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

test('Videla conserva medidas coexistentes y solo mantiene revisión por campos realmente pendientes', () => {
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
  assert.ok(proposal.reviewReasons.includes('missing_product'))
  assert.ok(!proposal.reviewReasons.includes('mixed_measurement_requires_review'))
  assert.ok(proposal.warnings.some((warning) => warning.includes('3,00BU') && warning.includes('15,60 KG')))
  assert.ok(proposal.warnings.includes('variable_weight_kg:15.6'))
  assert.equal(proposal.lineQuantity, '15.6')
  assert.equal(proposal.lineUnit, 'kg')
  assert.equal(proposal.mappingVersionId, null)
  assert.equal(proposal.normalizedUnitPrice, null)
})

test('Ametller elige la cabecera de líneas dentro de una tabla con secciones de metadatos', () => {
  const ametllerProfile: SupplierProfile = {
    ...directProfile,
    id: 'supplier:1:ametller',
    supplier: {
      id: 1,
      canonical_name: 'Ametller',
      aliases: ['Ametller Origen'],
      observed_document_identities: ['Ametller Origen S.L.'],
    },
    fields: {
      code: { aliases: ['Código'], meaning: 'código' },
      product: { aliases: ['Descripción'], meaning: 'producto' },
      quantity: { aliases: ['Cantidad'], meaning: 'cantidad facturada' },
      unit_price: { aliases: ['Precio por unidad / kg', 'P.U.', 'Precio'], meaning: 'precio' },
      discount_value: { aliases: ['Descuento'], meaning: 'descuento' },
      line_amount: { aliases: ['Importe'], meaning: 'importe' },
      tax_percent: { aliases: ['% IVA'], meaning: 'IVA' },
    },
    interpretation: {
      kind: 'direct_line',
      accepted_quantity_units: ['unit', 'kg'],
      amount_tax_basis: 'without_tax',
      rounding_tolerance: 0.01,
    },
    needs_review: [],
  }

  const raw = artifact([
    {
      data: {
        table_cells: [
          cell(0, 0, 'Albaran', true, 2),
          cell(0, 2, 'Fecha', true),
          cell(0, 3, 'CIF', true),
          cell(0, 4, 'Pedido Cliente', true, 3),
          cell(0, 6, 'Observaciones', true, 3),
          cell(1, 0, '01/0263729', true, 2),
          cell(1, 2, '15/09/2026', true),
          cell(1, 3, 'B09761628', true),
          cell(1, 4, '5011079', true, 3),
          cell(4, 1, 'Codiga', true),
          cell(4, 2, 'Descripcion', true),
          cell(4, 4, 'Cantidad', true),
          cell(4, 5, 'Precio', true),
          cell(4, 6, 'Importe', true),
          cell(4, 7, 'Neto', true),
          cell(4, 8, '%IVA', true),
          cell(5, 3, 'Pedido2026-51-118396 deFecha 14/09/2026', true),
          cell(6, 0, '16082'),
          cell(6, 1, 'A00260915 Cebolla Gorda', false, 2),
          cell(6, 4, '3,900KG'),
          cell(6, 5, '0,590'),
          cell(6, 6, '2,30'),
          cell(6, 7, '2,30'),
          cell(6, 8, '4,00%'),
        ],
      },
    },
    {
      data: {
        table_cells: [
          cell(0, 0, 'Imp.Bruto', true),
          cell(0, 1, 'Descuentos', true),
          cell(0, 2, 'Bases IVA', true),
          cell(0, 3, '%IVA', true),
          cell(1, 2, '158,52'),
          cell(1, 3, '4,00'),
        ],
      },
    },
  ], 'Ametller Origen S.L.')

  const proposals = normalizeDoclingEvidence({
    profile: ametllerProfile,
    rawArtifact: raw,
    supplierId: 1,
    mappings: [],
  }).proposals

  assert.equal(proposals.length, 1)
  const proposal = proposals[0]!
  assert.equal(proposal.sourceTableIndex, 0)
  assert.equal(proposal.sourceRowIndex, 6)
  assert.equal(proposal.sourceItemName, 'A00260915 Cebolla Gorda')
  assert.equal(proposal.lineQuantity, '3.9')
  assert.equal(proposal.lineUnit, 'kg')
  assert.equal(proposal.observedUnitPrice, '0.59')
  assert.equal(proposal.lineTotal, '2.3')
  assert.equal(proposal.status, 'needs_mapping')
})


test('Videla: peso variable reconciliado usa kg económico y conserva piezas como evidencia', () => {
  const videlaProfile: SupplierProfile = {
    ...directProfile,
    id: 'supplier:3:videla',
    version: '1.1.0',
    supplier: {
      id: 3,
      canonical_name: 'Videla',
      aliases: ['Pescados Videla'],
      observed_document_identities: ['Pescados Videla S.A.'],
    },
    fields: {
      product: { aliases: ['Artículo'], meaning: 'producto' },
      quantity: { aliases: ['Unidades'], meaning: 'PZ/BU/KG' },
      unit_price: { aliases: ['Precio'], meaning: 'precio' },
      line_amount: { aliases: ['Importe'], meaning: 'importe' },
    },
    interpretation: { kind: 'mixed_measure_review', rounding_tolerance: 0.01 },
    needs_review: ['solo si no concilia'],
  }

  const raw = artifact([{
    data: {
      table_cells: [
        cell(0, 0, 'Artículo', true),
        cell(0, 1, 'Unidades', true, 2),
        cell(0, 3, 'Precio', true),
        cell(0, 4, 'Importe', true),
        cell(1, 0, 'AÑOJO REDONDO'),
        cell(1, 1, '1,00PZ'),
        cell(1, 2, '2,18KG'),
        cell(1, 3, '13,25'),
        cell(1, 4, '28,89'),
      ],
    },
  }], 'Pescados Videla S.A.')

  const proposal = normalizeDoclingEvidence({
    profile: videlaProfile,
    rawArtifact: raw,
    supplierId: 3,
    mappings: [{
      id: 'mapping-anojo',
      supplierItemName: 'AÑOJO REDONDO',
      ingredientId: 'ingredient-anojo',
      conversionFactor: '1',
      lineBillingUnit: 'kg',
      lineContentQty: '1',
      lineContentUnit: 'kg',
      purchaseUnit: 'kg',
      baseUnit: 'g',
    }],
  }).proposals[0]!

  assert.equal(proposal.status, 'ready_for_review')
  assert.equal(proposal.lineQuantity, '2.18')
  assert.equal(proposal.lineUnit, 'kg')
  assert.equal(proposal.observedUnitPrice, '13.25')
  assert.equal(proposal.lineTotal, '28.89')
  assert.equal(proposal.purchaseQuantity, '2.18')
  assert.equal(proposal.physicalQuantity, '2180')
  assert.equal(proposal.normalizedUnitPrice, '13.25')
  assert.deepEqual(proposal.reviewReasons, [])
  assert.ok(proposal.warnings.includes('variable_weight_kg:2.18'))
  assert.deepEqual(
    (proposal.interpreted.variable_weight as Record<string, unknown>),
    {
      weight_kg: 2.18,
      piece_count: 1,
      economic_unit: 'kg',
      matched_measure: '2,18KG',
    }
  )
})
