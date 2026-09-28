import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupplierProfile } from '../supplier-profiles/types.ts'
import {
  extractDoclingLayoutTables,
  extractDoclingTables,
  matchProfileTable,
  rowByProfileFields,
} from './docling-evidence.ts'
import { normalizeDoclingEvidence } from './normalizer.ts'

function textSpan(text: string, left: number, right: number, top: number, bottom: number) {
  return {
    text,
    prov: [{
      page_no: 1,
      bbox: { l: left, r: right, t: top, b: bottom, coord_origin: 'TOPLEFT' },
    }],
  }
}

function tableCell(
  row: number,
  column: number,
  text: string,
  left: number,
  right: number,
  top: number,
  bottom: number,
  columnHeader = false
) {
  return {
    start_row_offset_idx: row,
    start_col_offset_idx: column,
    row_span: 1,
    col_span: 1,
    text,
    column_header: columnHeader,
    bbox: { l: left, r: right, t: top, b: bottom, coord_origin: 'TOPLEFT' },
  }
}

function artifact(params: { texts?: unknown[]; tables?: unknown[] }) {
  return {
    document: {
      text_content: 'Proveedor Test',
      json_content: {
        pages: { '1': { size: { width: 1200, height: 1600 } } },
        texts: params.texts ?? [],
        tables: params.tables ?? [],
      },
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
    code: { aliases: ['Código'], meaning: 'código' },
    product: { aliases: ['Descripción'], meaning: 'producto' },
    quantity: { aliases: ['Cantidad'], meaning: 'cantidad' },
    unit_price: { aliases: ['Precio'], meaning: 'precio' },
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
  examples: [],
}

test('rechaza una tabla nativa de totales sin producto ni cantidad', () => {
  const raw = artifact({
    tables: [{
      data: {
        table_cells: [
          tableCell(0, 0, 'Base', 100, 160, 100, 120, true),
          tableCell(0, 1, '% IVA', 200, 260, 100, 120, true),
          tableCell(0, 2, 'Importe', 300, 380, 100, 120, true),
          tableCell(1, 0, '100,00', 100, 160, 140, 160),
          tableCell(1, 1, '10', 200, 240, 140, 160),
          tableCell(1, 2, '110,00', 300, 360, 140, 160),
        ],
      },
    }],
  })

  assert.equal(matchProfileTable(directProfile, extractDoclingTables(raw)), null)
})

test('Videla puede inferir la columna de producto sin inventarla desde una columna numérica', () => {
  const videlaProfile: SupplierProfile = {
    ...directProfile,
    id: 'supplier:3:videla',
    supplier: {
      id: 3,
      canonical_name: 'Videla',
      aliases: [],
      observed_document_identities: ['Videla'],
    },
    fields: {
      product: { aliases: ['Artículo'], meaning: 'producto' },
      quantity: { aliases: ['Unidades'], meaning: 'medidas' },
      unit_price: { aliases: ['Precio'], meaning: 'precio' },
      line_amount: { aliases: ['Importe'], meaning: 'importe' },
    },
    interpretation: { kind: 'mixed_measure_review', rounding_tolerance: 0.01 },
  }

  const raw = artifact({
    tables: [{
      data: {
        table_cells: [
          tableCell(0, 2, 'Unidades', 620, 710, 100, 120, true),
          tableCell(0, 4, 'Precio', 820, 880, 100, 120, true),
          tableCell(0, 5, 'Importe', 960, 1040, 100, 120, true),
          tableCell(1, 0, 'POLLO CONG PECHUGA', 160, 360, 150, 175),
          tableCell(1, 2, '5,00CJ', 630, 700, 150, 175),
          tableCell(1, 3, '12,50 KG', 740, 820, 150, 175),
          tableCell(1, 4, '5,56', 850, 900, 150, 175),
          tableCell(1, 5, '69,50', 980, 1030, 150, 175),
        ],
      },
    }],
  })

  const tables = extractDoclingTables(raw)
  const match = matchProfileTable(videlaProfile, tables)
  assert.ok(match)
  assert.equal(match.fieldColumns.product, 0)
  assert.equal(rowByProfileFields(match, match.table.rows[0]!).product, 'POLLO CONG PECHUGA')
})

test('reconstruye Santa Teresa desde texts con cabecera y filas por coordenadas', () => {
  const santaProfile: SupplierProfile = {
    ...directProfile,
    id: 'supplier:7:santa-teresa',
    supplier: {
      id: 7,
      canonical_name: 'Santa Teresa',
      aliases: [],
      observed_document_identities: ['Santa Teresa'],
    },
    fields: {
      quantity: { aliases: ['Unidades'], meaning: 'unidades' },
      cases: { aliases: ['Cajas'], meaning: 'cajas' },
      product: { aliases: ['Artículo'], meaning: 'producto' },
      unit_price: { aliases: ['Precio'], meaning: 'precio' },
      line_amount: { aliases: ['Importe'], meaning: 'importe' },
    },
    interpretation: { kind: 'direct_line', quantity_unit: 'unit', amount_tax_basis: 'without_tax' },
  }

  const raw = artifact({
    texts: [
      textSpan('Unidades', 50, 130, 100, 120),
      textSpan('Cajas', 160, 220, 100, 120),
      textSpan('Articulo', 300, 390, 100, 120),
      textSpan('Precio', 700, 760, 100, 120),
      textSpan('Importe', 830, 900, 100, 120),
      textSpan('5', 80, 95, 150, 170),
      textSpan('0', 185, 200, 150, 170),
      textSpan('FRANKF.MAX ZANDER', 300, 520, 150, 170),
      textSpan('13.50', 710, 760, 150, 170),
      textSpan('67.50', 840, 895, 150, 170),
      textSpan('12', 75, 100, 185, 205),
      textSpan('0', 185, 200, 185, 205),
      textSpan('BACON FOOD SERVICE', 300, 520, 185, 205),
      textSpan('5.99', 715, 755, 185, 205),
      textSpan('71.88', 840, 895, 185, 205),
    ],
  })

  const tables = extractDoclingLayoutTables(santaProfile, raw)
  assert.equal(tables.length, 1)
  assert.equal(tables[0]!.source, 'layout_fallback')
  assert.equal(tables[0]!.rows.length, 2)

  const match = matchProfileTable(santaProfile, tables)
  assert.ok(match)
  const first = rowByProfileFields(match, match.table.rows[0]!)
  assert.equal(first.product, 'FRANKF.MAX ZANDER')
  assert.equal(first.quantity, '5')
  assert.equal(first.unit_price, '13.50')
  assert.equal(first.line_amount, '67.50')
})

test('fallback híbrido usa cabecera de texts y recupera líneas que Docling marcó como header', () => {
  const raw = artifact({
    texts: [
      textSpan('Codigo', 30, 100, 100, 120),
      textSpan('Descripcion', 160, 290, 100, 120),
      textSpan('Cantidad', 500, 590, 100, 120),
      textSpan('Precio Importe Dto.', 660, 725, 100, 120),
      textSpan('%IVA', 1080, 1140, 100, 120),
    ],
    tables: [{
      prov: [{ page_no: 1 }],
      data: {
        table_cells: [
          tableCell(0, 0, '201', 20, 60, 150, 172, true),
          tableCell(0, 1, 'A102260922 Ajo Granel', 90, 350, 150, 172, true),
          tableCell(0, 2, '0,250 KG', 550, 630, 150, 172, true),
          tableCell(0, 4, '5,100', 705, 750, 150, 172, true),
          tableCell(0, 5, '1,28', 825, 865, 150, 172, true),
          tableCell(0, 6, '1,28', 1030, 1070, 150, 172, true),
          tableCell(0, 7, '4,00%', 1100, 1160, 150, 172, true),
          tableCell(1, 0, '8100', 20, 60, 185, 207),
          tableCell(1, 1, 'L0926 Arroz Redondo Extra 1Kg', 90, 355, 185, 207),
          tableCell(1, 2, '2,000', 550, 605, 185, 207),
          tableCell(1, 3, 'UNI', 640, 680, 185, 207),
          tableCell(1, 4, '1,730', 705, 750, 185, 207),
          tableCell(1, 5, '3,46', 825, 865, 185, 207),
          tableCell(1, 6, '3,46', 1030, 1070, 185, 207),
          tableCell(1, 7, '4,00%', 1100, 1160, 185, 207),
        ],
      },
    }],
  })

  assert.equal(matchProfileTable(directProfile, extractDoclingTables(raw)), null)

  const tables = extractDoclingLayoutTables(directProfile, raw)
  assert.equal(tables.length, 1)
  assert.equal(tables[0]!.rows.length, 2)

  const match = matchProfileTable(directProfile, tables)
  assert.ok(match)
  const second = rowByProfileFields(match, match.table.rows[1]!)
  assert.equal(second.product, 'L0926 Arroz Redondo Extra 1Kg')
  assert.equal(second.quantity, '2,000 UNI')
  assert.equal(second.unit_price, '1,730')
  assert.equal(second.line_amount, '3,46')
})


test('normalizador etiqueta el fallback como evidencia de layout y nunca como Docling nativo', () => {
  const profile: SupplierProfile = {
    ...directProfile,
    id: 'supplier:7:santa-layout',
    supplier: {
      id: 7,
      canonical_name: 'Santa Layout',
      aliases: [],
      observed_document_identities: ['Santa Layout'],
    },
    fields: {
      quantity: { aliases: ['Unidades'], meaning: 'unidades' },
      product: { aliases: ['Artículo'], meaning: 'producto' },
      unit_price: { aliases: ['Precio'], meaning: 'precio' },
      line_amount: { aliases: ['Importe'], meaning: 'importe' },
    },
    interpretation: { kind: 'direct_line', quantity_unit: 'unit', amount_tax_basis: 'without_tax' },
  }

  const raw = artifact({
    texts: [
      textSpan('Unidades', 50, 130, 100, 120),
      textSpan('Articulo', 300, 390, 100, 120),
      textSpan('Precio', 700, 760, 100, 120),
      textSpan('Importe', 830, 900, 100, 120),
      textSpan('5', 80, 95, 150, 170),
      textSpan('BACON FOOD SERVICE', 300, 520, 150, 170),
      textSpan('5.99', 715, 755, 150, 170),
      textSpan('29.95', 840, 895, 150, 170),
    ],
  })

  const proposal = normalizeDoclingEvidence({
    profile,
    rawArtifact: raw,
    supplierId: 7,
    mappings: [],
  }).proposals[0]!

  assert.equal(proposal.provenanceSource, 'docling_layout_fallback')
  assert.equal(proposal.sourceItemName, 'BACON FOOD SERVICE')
  assert.equal(proposal.status, 'needs_mapping')
  assert.ok(proposal.reviewReasons.includes('mapping_missing'))
})
