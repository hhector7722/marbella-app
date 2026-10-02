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
  assert.equal(proposal.mappingVersionId === null, proposal.ingredientId === null)
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

test('alias legacy único identifica ingrediente pero exige validar presentación sin normalizar', () => {
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
    legacyIdentities: [{ supplierItemName: 'Calamar', ingredientId: 'ingredient-legacy' }],
  }).proposals[0]!

  assert.equal(proposal.ingredientId, null)
  assert.equal(proposal.mappingVersionId, null)
  assert.equal(proposal.status, 'needs_review')
  assert.ok(proposal.reviewReasons.includes('mapping_missing'))
  assert.ok(proposal.reviewReasons.includes('legacy_identity_requires_presentation_validation'))
  assert.equal(proposal.mappingVersionId === null, proposal.ingredientId === null)
  assert.deepEqual(proposal.normalized, {})
  assert.equal(proposal.physicalQuantity, null)
  assert.equal(proposal.purchaseQuantity, null)
  assert.equal(proposal.normalizedUnitPrice, null)
})

test('alias legacy inexistente mantiene needs_mapping', () => {
  const raw = artifact([{
    data: { table_cells: [
      cell(0, 0, 'Producto', true), cell(0, 1, 'Cantidad', true),
      cell(0, 2, 'Precio', true), cell(0, 3, 'Importe', true),
      cell(1, 0, 'CALAMAR'), cell(1, 1, '1 KG'),
      cell(1, 2, '9,75'), cell(1, 3, '9,75'),
    ] },
  }])
  const proposal = normalizeDoclingEvidence({
    profile: directProfile,
    rawArtifact: raw,
    supplierId: 999,
    mappings: [],
    legacyIdentities: [{ supplierItemName: 'MERLUZA', ingredientId: 'ingredient-merluza' }],
  }).proposals[0]!

  assert.equal(proposal.status, 'needs_mapping')
  assert.equal(proposal.ingredientId, null)
})

test('alias legacy ambiguo nunca selecciona ingrediente arbitrariamente', () => {
  const raw = artifact([{
    data: { table_cells: [
      cell(0, 0, 'Producto', true), cell(0, 1, 'Cantidad', true),
      cell(0, 2, 'Precio', true), cell(0, 3, 'Importe', true),
      cell(1, 0, 'CALAMAR'), cell(1, 1, '1 KG'),
      cell(1, 2, '9,75'), cell(1, 3, '9,75'),
    ] },
  }])
  const proposal = normalizeDoclingEvidence({
    profile: directProfile,
    rawArtifact: raw,
    supplierId: 999,
    mappings: [],
    legacyIdentities: [
      { supplierItemName: 'CALAMAR', ingredientId: 'ingredient-a' },
      { supplierItemName: 'calamar', ingredientId: 'ingredient-b' },
    ],
  }).proposals[0]!

  assert.equal(proposal.status, 'needs_mapping')
  assert.equal(proposal.ingredientId, null)
  assert.equal(proposal.mappingVersionId, null)
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

test('Videla conserva el producto para revisión aunque la tabla económica venga separada', () => {
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

  const proposal = normalizeDoclingEvidence({
    profile: videlaProfile,
    rawArtifact: raw,
    supplierId: 3,
    mappings: [],
  }).proposals[0]!

  assert.equal(proposal.status, 'needs_review')
  assert.equal(proposal.sourceItemName, 'CALAMAR CONG.... CROQUETA COCIDO ENTRANA')
  assert.equal(proposal.observedUnitPrice, null)
  assert.ok(proposal.reviewReasons.includes('generic_evidence_fallback'))
  assert.ok(proposal.warnings.includes('generic_recovery_unverified'))
  assert.equal(proposal.mappingVersionId, null)
  assert.equal(proposal.ingredientId, null)
})

test('fallback genérico infiere columna de producto cuando Docling omite su cabecera', () => {
  const videlaProfile: SupplierProfile = {
    ...directProfile,
    id: 'supplier:3:videla-recall',
    supplier: {
      id: 3,
      canonical_name: 'Videla',
      aliases: ['Pescados Videla'],
      observed_document_identities: ['Pescados Videla S.A.'],
    },
    fields: {
      product: { aliases: ['Artículo'], meaning: 'producto' },
      quantity: { aliases: ['Unidades'], meaning: 'medidas observadas' },
      unit_price: { aliases: ['Precio'], meaning: 'precio' },
      line_amount: { aliases: ['Importe'], meaning: 'importe' },
    },
    interpretation: { kind: 'mixed_measure_review', rounding_tolerance: 0.01 },
    needs_review: [],
  }

  const raw = artifact([{
    data: {
      table_cells: [
        cell(0, 1, '%Iva', true),
        cell(0, 2, 'Unidades', true),
        cell(0, 4, 'Precio', true),
        cell(0, 5, 'Importe', true),
        cell(1, 0, 'POLLO CONG PECHUGA'),
        cell(1, 1, '10'),
        cell(1, 2, '5,00CJ'),
        cell(1, 3, '12,50 KG'),
        cell(1, 4, '5,56'),
        cell(1, 5, '69,50'),
        cell(2, 0, 'CERDO LOMO CANA FILETEADO'),
        cell(2, 1, '10'),
        cell(2, 3, '8,14KG'),
        cell(2, 4, '6,25'),
        cell(2, 5, '50,88'),
      ],
    },
  }], 'Pescados Videla S.A.')

  const proposals = normalizeDoclingEvidence({
    profile: videlaProfile,
    rawArtifact: raw,
    supplierId: 3,
    mappings: [],
  }).proposals

  assert.equal(proposals.length, 2)
  assert.deepEqual(
    proposals.map((proposal) => proposal.sourceItemName),
    ['POLLO CONG PECHUGA', 'CERDO LOMO CANA FILETEADO']
  )
  assert.equal(proposals[0]!.lineQuantity, '5')
  assert.equal(proposals[0]!.observedUnitPrice, '5.56')
  assert.equal(proposals[0]!.lineTotal, '69.5')
  assert.ok(proposals.every((proposal) => proposal.status === 'needs_review'))
  assert.ok(proposals.every((proposal) => proposal.reviewReasons.includes('generic_evidence_fallback')))
})

test('un match estructural con producto vacío cae a recall genérico en vez de ocultar la línea', () => {
  const raw = artifact([{
    data: {
      table_cells: [
        cell(0, 0, 'Producto', true),
        cell(0, 1, 'Cantidad', true),
        cell(0, 2, 'Precio', true),
        cell(0, 3, 'Importe', true),
        cell(0, 4, 'Detalle', true),
        cell(1, 0, ''),
        cell(1, 1, '2 KG'),
        cell(1, 2, '5,00'),
        cell(1, 3, '10,00'),
        cell(1, 4, 'CALAMAR PREMIUM'),
      ],
    },
  }])

  const proposals = normalizeDoclingEvidence({
    profile: directProfile,
    rawArtifact: raw,
    supplierId: 999,
    mappings: [],
  }).proposals

  assert.equal(proposals.length, 1)
  assert.equal(proposals[0]!.sourceItemName, 'CALAMAR PREMIUM')
  assert.equal(proposals[0]!.status, 'needs_review')
  assert.equal(proposals[0]!.lineQuantity, '2')
  assert.equal(proposals[0]!.observedUnitPrice, '5')
  assert.equal(proposals[0]!.lineTotal, '10')
  assert.ok(proposals[0]!.reviewReasons.includes('generic_evidence_fallback'))
  assert.equal(proposals[0]!.mappingVersionId, null)
  assert.equal(proposals[0]!.ingredientId, null)
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


test('Ametller real: recupera cabecera semántica sin flag y columnas fusionadas', () => {
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
          cell(0, 0, 'Albaran Fecha', true),
          cell(0, 1, 'Pedido Cliente', true),
          cell(0, 2, 'CIF', true),
          cell(0, 9, 'Observaciones', true),
          cell(3, 0, 'Ruta', true),
          cell(3, 1, 'Conductor', true),
          cell(3, 7, '%IVA', true),
          cell(4, 0, 'Codigo Lote Descripcion Cantidad Pedido2026-51-124309 deFecha24/09/2026'),
          cell(4, 4, 'Precio'),
          cell(4, 5, 'Importe'),
          cell(4, 6, 'Dto. Neto'),
          cell(5, 0, '41423 L092625C14A Aceite Oliva Suave 5L'),
          cell(5, 1, '1,000UNI'),
          cell(5, 4, '23,990'),
          cell(5, 5, '23,99'),
          cell(6, 0, '42019'),
          cell(6, 1, '2,000 BOL'),
          cell(6, 2, 'B260925 Ensalada Mezclum 7 Brotes Bolsa 500g'),
          cell(6, 4, '4,490'),
          cell(6, 5, '8,98'),
        ],
      },
    },
    {
      data: {
        table_cells: [
          cell(0, 0, 'Imp.Bruto'),
          cell(0, 1, 'Descuentos'),
          cell(0, 2, 'Bases IVA'),
          cell(0, 3, '%IVA'),
          cell(1, 0, '32,97'),
          cell(1, 2, '32,97'),
        ],
      },
    },
  ], 'Ametller Origen S.L.')

  const result = normalizeDoclingEvidence({
    profile: ametllerProfile,
    rawArtifact: raw,
    supplierId: 1,
    mappings: [{
      id: 'mapping-aceite',
      supplierItemName: 'Aceite Oliva Suave 5L',
      ingredientId: 'ingredient-aceite',
      conversionFactor: '1',
      lineBillingUnit: 'ud',
      lineContentQty: '5',
      lineContentUnit: 'l',
      purchaseUnit: 'l',
      baseUnit: 'ml',
    }],
  })

  assert.equal(result.normalizerVersion, 'k5-normalizer-v12')
  assert.equal(result.proposals.length, 2)

  const aceite = result.proposals[0]!
  assert.equal(aceite.sourceTableIndex, 0)
  assert.equal(aceite.sourceRowIndex, 5)
  assert.equal(aceite.sourceItemName, '41423 L092625C14A Aceite Oliva Suave 5L')
  assert.equal(aceite.lineQuantity, '1')
  assert.equal(aceite.observedUnitPrice, '23.99')
  assert.equal(aceite.lineTotal, '23.99')
  assert.equal(aceite.mappingVersionId, 'mapping-aceite')

  const mezclum = result.proposals[1]!
  assert.equal(mezclum.sourceTableIndex, 0)
  assert.equal(mezclum.sourceRowIndex, 6)
  assert.equal(mezclum.sourceItemName, 'B260925 Ensalada Mezclum 7 Brotes Bolsa 500g')
  assert.equal(mezclum.lineQuantity, '2')
  assert.equal(mezclum.observedUnitPrice, '4.49')
  assert.equal(mezclum.lineTotal, '8.98')
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


test('fallback genérico reutiliza mapping exacto y descarta metadatos sin señal de línea', () => {
  const raw = artifact([{
    data: {
      table_cells: [
        cell(0, 0, 'Producto', true),
        cell(0, 1, 'Precio', true),
        cell(1, 0, 'CALAMAR'),
        cell(1, 1, '9,75'),
        cell(2, 0, 'VENDEDOR REPARTIDOR'),
        cell(2, 1, ''),
      ],
    },
  }])

  const result = normalizeDoclingEvidence({
    profile: directProfile,
    rawArtifact: raw,
    supplierId: 999,
    mappings: [{
      id: 'mapping-fallback',
      supplierItemName: 'CALAMAR',
      ingredientId: 'ingredient-calamares',
      conversionFactor: '1',
      lineBillingUnit: 'kg',
      lineContentQty: '1',
      lineContentUnit: 'kg',
      purchaseUnit: 'kg',
      baseUnit: 'g',
    }],
  })

  assert.equal(result.normalizerVersion, 'k5-normalizer-v12')
  assert.equal(result.proposals.length, 1)
  const proposal = result.proposals[0]!
  assert.equal(proposal.sourceItemName, 'CALAMAR')
  assert.equal(proposal.mappingVersionId, 'mapping-fallback')
  assert.equal(proposal.ingredientId, 'ingredient-calamares')
  assert.equal(proposal.status, 'needs_review')
  assert.equal(proposal.lineUnit, 'kg')
  assert.ok(proposal.reviewReasons.includes('generic_evidence_fallback'))
  assert.ok(proposal.reviewReasons.includes('mapping_requires_human_review'))
  assert.ok(!result.proposals.some((item) => item.sourceItemName === 'VENDEDOR REPARTIDOR'))
})


test('Santa Teresa recupera 24 líneas cuando Docling colapsa toda la tabla en una fila', () => {
  const santaTeresaProfile: SupplierProfile = {
    ...directProfile,
    id: 'supplier:7:santa-teresa',
    supplier: {
      id: 7,
      canonical_name: 'GRUP SANTA TERESA',
      aliases: ['SANTA TERESA'],
      observed_document_identities: ['GRUP SANTA TERESA'],
    },
    fields: {
      quantity: { aliases: ['Unidades'], meaning: 'unidades facturadas' },
      cases: { aliases: ['Cajas'], meaning: 'cajas informativas' },
      product: { aliases: ['Artículo'], meaning: 'producto' },
      unit_price: { aliases: ['Precio'], meaning: 'EUR/unidad sin IVA' },
      line_amount: { aliases: ['Importe'], meaning: 'importe de línea sin IVA' },
      price_with_tax: { aliases: ['PretIva'], meaning: 'EUR/unidad con IVA' },
    },
    interpretation: {
      kind: 'direct_line',
      quantity_unit: 'unit',
      price_unit: 'EUR/unit',
      amount_tax_basis: 'without_tax',
    },
    needs_review: [],
  }

  const raw = artifact([{
    data: {
      table_cells: [
        cell(0, 0, 'Unidades'),
        cell(0, 2, 'Ibee'),
        cell(0, 3, 'Precio', true),
        cell(0, 4, 'Importe', true),
        cell(0, 5, 'Pre+Iva', true),
        cell(1, 0, '1 2 6 6 6 15 24 24 24 24 24 24 24 24 24 48 48 2 48 2 72 3 72 3 120 5 216 9 264 11 432 18'),
        cell(1, 1, 'secep Articulo 0 MIEL DE FLORES FRUBBO 350G 0 PIMIENT.PIQUILLO CR.370 BAIGOR 0 Q.EDAM BARRA ODELBURGER.OFERTA 1 OLIVAS EL FARO GIGANTES 1 ROLLO SECAMANOS 2/C SUAO 800gr 0 PINCHO CARACOL 100un. 1 NESTEA LIMONA S/SUCRE MARACUY 1 NESTEA LIMON LATA 33CL 1 SCHWEPPES TONICA S/R. 1 VOLL DAMM LATA 1 AIGUA MALAVELLA GAS 1/3 N/RET. 1 JUVER PINYA 200G. 1 CERVESA FREE DAMM TOSTADA 0,0 1 LATA S/ALCOHOL FREE DAMM. 1 BITTER KAS CRISTAL S/R.OFERTA 2 AQUARIUS NARANJA LATA IATA DAMM LEMON 33CL. AIGUA VICHY PETITA S/R. GERVEZA ALHAMBRA 1925 VERDE CACAOLAT PEQU.ENV.PLAST. 275CC AQUARIUS LATAS. GOCA COLA LATA NACIONAL 33CL GOCA COLA ZERO NACIONAL LATA RSTRELLA LATA DAMM'),
        cell(1, 2, '0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.90 0.00 0.00 0.00 0.00 0.00 0.72 0.00 0.00 0.00 0.00 2.16 0.00 10.69 0.00 0.00'),
        cell(1, 3, '3.75 2.95 5.95 6.95 2.80 0.80 0.75 0.57 0.75 0.54 0.70 0.50 0.50 0.46 0.80 0.70 0.41 0.70 0.80 1.15 0.70 0.60 0.60 0.54'),
        cell(1, 4, '3.75 5.90 35.70 41.70 16.80 12.00 18.00 13.68 18.00 12.96 16.80 12.00 12.00 11.04 19.20 33.60 19.68 33.60 57.60 82.80 84.00 129.60 158.40 233.28'),
        cell(1, 5, '4.13 3.25 6.19 7.65 3.39 0.97 0.83 0.69 0.91 0.65 0.77 0.61 0.61 0.56 0.97 0.85 0.50 0.77 0.97 1.27 0.85 0.73 0.73 0.65'),
      ],
    },
  }], 'GRUP SANTA TERESA')

  const aliases = [
    'PIMIENT.PIQUILLO CR.370 BAIGOR',
    'Q.EDAM BARRA ODELBURGER.OFERTA',
    'OLIVAS EL FARO GIGANTES',
    'ROLLO SECAMANOS 2/C SUAO 800gr',
    'PINCHO CARACOL 100un.',
    'NESTEA LIMONA S/SUCRE MARACUY',
    'NESTEA LIMON LATA 33CL',
    'SCHWEPPES TONICA S/R.',
    'VOLL DAMM LATA',
    'AIGUA MALAVELLA GAS 1/3 N/RET.',
    'JUVER PINYA 200G.',
    'CERVESA FREE DAMM TOSTADA 0,0',
    'LATA S/ALCOHOL FREE DAMM.',
    'BITTER KAS CRISTAL S/R.OFERTA',
    'AQUARIUS NARANJA LATA',
    'LATA DAMM LEMON 33CL.',
    'AIGUA VICHY PETITA S/R.',
    'CERVEZA ALHAMBRA 1925 VERDE',
    'CACAOLAT PEQU.ENV.PLAST. 275CC',
    'AQUARIUS LATAS.',
    'COCA COLA LATA NACIONAL 33CL',
    'COCA COLA ZERO NACIONAL LATA',
    'ESTRELLA LATA DAMM',
  ]

  const result = normalizeDoclingEvidence({
    profile: santaTeresaProfile,
    rawArtifact: raw,
    supplierId: 7,
    mappings: [],
    legacyIdentities: aliases.map((supplierItemName, index) => ({
      supplierItemName,
      ingredientId: `ingredient-${index}`,
    })),
  })

  assert.equal(result.normalizerVersion, 'k5-normalizer-v12')
  assert.equal(result.proposals.length, 24)
  assert.equal(result.proposals[0]!.sourceItemName, 'MIEL DE FLORES FRUBBO 350G')
  assert.equal(result.proposals[0]!.lineQuantity, '1')
  assert.equal(result.proposals[0]!.observedUnitPrice, '3.75')
  assert.equal(result.proposals[0]!.lineTotal, '3.75')
  assert.equal(result.proposals[15]!.sourceItemName, 'AQUARIUS NARANJA LATA')
  assert.equal(result.proposals[16]!.sourceItemName, 'IATA DAMM LEMON 33CL.')
  assert.equal(result.proposals[23]!.sourceItemName, 'RSTRELLA LATA DAMM')
  assert.ok(result.proposals.every((proposal) => proposal.warnings.includes('santa_teresa_collapsed_table_recovered')))
})
