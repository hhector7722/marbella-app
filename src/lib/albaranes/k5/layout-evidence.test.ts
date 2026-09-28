import assert from 'node:assert/strict'
import test from 'node:test'
import { supplierProfileForId } from './profile-registry.ts'
import {
  extractDoclingLayoutTables,
  extractDoclingTables,
  matchProfileTable,
  rowByProfileFields,
} from './docling-evidence.ts'

function textItem(index: number, text: string, x: number, y: number, width = 80) {
  return {
    self_ref: `#/texts/${index}`,
    label: 'text',
    text,
    prov: [{
      page_no: 1,
      bbox: {
        l: x,
        r: x + width,
        b: y,
        t: y + 18,
        coord_origin: 'BOTTOMLEFT',
      },
    }],
  }
}

function tableCell(
  row: number,
  column: number,
  text: string,
  columnHeader = false,
  colSpan = 1
) {
  return {
    start_row_offset_idx: row,
    start_col_offset_idx: column,
    row_span: 1,
    col_span: colSpan,
    text,
    column_header: columnHeader,
  }
}

function artifact(params: { texts?: unknown[]; tables?: unknown[] }) {
  return {
    document: {
      text_content: '',
      json_content: {
        texts: params.texts ?? [],
        tables: params.tables ?? [],
      },
    },
  }
}

test('Santa Teresa: no_table se reconstruye desde texts+bbox sin inventar una tabla Docling', () => {
  const profile = supplierProfileForId(7)!
  const raw = artifact({
    texts: [
      textItem(0, 'Unidades', 50, 1000),
      textItem(1, 'Cajas', 155, 1000),
      textItem(2, 'Articulo', 300, 1000, 120),
      textItem(3, 'Precio', 700, 1000),
      textItem(4, 'Importe', 820, 1000),
      textItem(5, '2', 70, 955, 20),
      textItem(6, '1', 175, 955, 20),
      textItem(7, 'FRANKF.MAX ZANDER 16P.HEIDELBE', 245, 955, 290),
      textItem(8, '3,50', 710, 955, 45),
      textItem(9, '7,00', 830, 955, 45),
    ],
  })

  assert.equal(extractDoclingTables(raw, profile).length, 0)
  const layoutTables = extractDoclingLayoutTables(profile, raw)
  assert.equal(layoutTables.length, 1)
  assert.equal(layoutTables[0]!.source, 'docling_layout')

  const match = matchProfileTable(profile, layoutTables)
  assert.ok(match)
  const row = rowByProfileFields(match, match.table.rows[0]!)
  assert.equal(row.product, 'FRANKF.MAX ZANDER 16P.HEIDELBE')
  assert.equal(row.quantity, '2')
  assert.equal(row.cases, '1')
  assert.equal(row.unit_price, '3,50')
  assert.equal(row.line_amount, '7,00')
})

test('Sanilec: una tabla de IVA sin producto se rechaza y el layout recupera las líneas', () => {
  const profile = supplierProfileForId(9)!
  const raw = artifact({
    tables: [{
      data: {
        table_cells: [
          tableCell(0, 0, '% IVA', true),
          tableCell(0, 1, 'Importe', true),
          tableCell(1, 0, '10'),
          tableCell(1, 1, '12,34'),
        ],
      },
    }],
    texts: [
      textItem(0, 'Articulo', 100, 1000),
      textItem(1, 'Descripcion', 300, 1000, 120),
      textItem(2, 'Cantidad', 580, 1000),
      textItem(3, 'Precio', 730, 1000),
      textItem(4, 'Importe', 970, 1000),
      textItem(5, '1505', 105, 955, 45),
      textItem(6, 'VASO CARTON Kraft 8oz', 200, 955, 250),
      textItem(7, '2 UNI', 590, 955, 55),
      textItem(8, '1,20', 735, 955, 45),
      textItem(9, '2,40', 975, 955, 45),
    ],
  })

  const native = extractDoclingTables(raw, profile)
  assert.equal(native.length, 1)
  assert.equal(matchProfileTable(profile, native), null)

  const layout = extractDoclingLayoutTables(profile, raw, native.length)
  const match = matchProfileTable(profile, layout)
  assert.ok(match)
  assert.equal(match.table.index, 1)
  const row = rowByProfileFields(match, match.table.rows[0]!)
  assert.equal(row.code, '1505')
  assert.equal(row.product, 'VASO CARTON Kraft 8oz')
  assert.equal(row.quantity, '2 UNI')
  assert.equal(row.unit_price, '1,20')
  assert.equal(row.line_amount, '2,40')
})

test('Videla: dos tablas parciales no se aceptan como tabla de líneas y el layout reúne la fila', () => {
  const profile = supplierProfileForId(3)!
  const raw = artifact({
    tables: [
      {
        data: {
          table_cells: [
            tableCell(0, 0, 'Artículo', true),
            tableCell(1, 0, 'POLLO CONG.PECHUGA'),
          ],
        },
      },
      {
        data: {
          table_cells: [
            tableCell(0, 0, 'Unidades', true),
            tableCell(0, 1, 'Precio', true),
            tableCell(0, 2, 'Importe', true),
            tableCell(1, 0, '1,00 PZ 2,18 KG'),
            tableCell(1, 1, '13,25'),
            tableCell(1, 2, '28,89'),
          ],
        },
      },
    ],
    texts: [
      textItem(0, 'Articulo', 160, 1000),
      textItem(1, 'Unidades', 540, 1000),
      textItem(2, 'Precio', 720, 1000),
      textItem(3, 'Importe', 840, 1000),
      textItem(4, 'POLLO CONG.PECHUGA', 145, 950, 250),
      textItem(5, '1,00 PZ', 530, 950, 65),
      textItem(6, '2,18 KG', 600, 950, 70),
      textItem(7, '13,25', 725, 950, 50),
      textItem(8, '28,89', 845, 950, 50),
    ],
  })

  const native = extractDoclingTables(raw, profile)
  assert.equal(matchProfileTable(profile, native), null)

  const layout = extractDoclingLayoutTables(profile, raw, native.length)
  const match = matchProfileTable(profile, layout)
  assert.ok(match)
  const row = rowByProfileFields(match, match.table.rows[0]!)
  assert.equal(row.product, 'POLLO CONG.PECHUGA')
  assert.match(String(row.quantity), /1,00 PZ/)
  assert.match(String(row.quantity), /2,18 KG/)
  assert.equal(row.unit_price, '13,25')
  assert.equal(row.line_amount, '28,89')
})

test('Ametller: la cabecera semántica gana aunque Docling marque una fila de producto como header', () => {
  const profile = supplierProfileForId(1)!
  const raw = artifact({
    tables: [{
      data: {
        table_cells: [
          tableCell(0, 0, 'Albaran', true),
          tableCell(0, 1, 'Fecha', true),
          tableCell(4, 0, 'Codigo', true),
          tableCell(4, 1, 'Descripcion', true),
          tableCell(4, 2, 'Cantidad', true),
          tableCell(4, 3, 'Precio', true),
          tableCell(4, 4, 'Importe', true),
          tableCell(5, 0, '201', true),
          tableCell(5, 1, 'A102260922 Ajo Granel', true),
          tableCell(5, 2, '0,250 KG', true),
          tableCell(5, 3, '5,100', true),
          tableCell(5, 4, '1,28', true),
          tableCell(5, 5, '4,00%', true),
          tableCell(6, 0, '202'),
          tableCell(6, 1, 'A05260922 Albahaca Manojo'),
          tableCell(6, 2, '2 UNI'),
          tableCell(6, 3, '1,500'),
          tableCell(6, 4, '3,00'),
        ],
      },
    }],
  })

  const tables = extractDoclingTables(raw, profile)
  const match = matchProfileTable(profile, tables)
  assert.ok(match)
  const row = rowByProfileFields(match, match.table.rows[0]!)
  assert.equal(row.product, 'A05260922 Albahaca Manojo')
  assert.equal(row.quantity, '2 UNI')
  assert.equal(row.unit_price, '1,500')
  assert.equal(row.line_amount, '3,00')
})
