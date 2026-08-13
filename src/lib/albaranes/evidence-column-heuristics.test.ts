import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { GeminiDocumentTable } from './gemini-extract-albaran.ts'
import {
  extractDocumentRowCandidates,
  findColumnIndices,
  isGarbageDocumentDescription,
} from './evidence-column-heuristics.ts'
import {
  matchHistoricalRows,
  type DocumentRowForMatch,
  type OperativeLineForMatch,
} from '../evidence-backfill/matcher.ts'

function table(
  index: number,
  columns: Array<{ index: number; name: string | null }>,
  rows: Array<{ index: number; cells: Array<{ column_index: number; raw_value: string | null }> }>
): GeminiDocumentTable {
  return { index, columns, rows }
}

describe('evidence-column-heuristics Grupo A headers', () => {
  it('Abril: ARTICLE / PREU / QUILOS / IMPORT', () => {
    const t = table(
      0,
      [
        { index: 0, name: 'COD' },
        { index: 1, name: 'UNIT' },
        { index: 2, name: 'QUILOS' },
        { index: 3, name: 'ARTICLE' },
        { index: 4, name: 'LOT' },
        { index: 5, name: 'PREU' },
        { index: 6, name: 'IMPORT' },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: '123' },
            { column_index: 1, raw_value: 'CJ' },
            { column_index: 2, raw_value: '2,5' },
            { column_index: 3, raw_value: ' entrecot vedella' },
            { column_index: 4, raw_value: 'L1' },
            { column_index: 5, raw_value: '12,50' },
            { column_index: 6, raw_value: '31,25' },
          ],
        },
      ]
    )
    const cols = findColumnIndices(t)
    assert.equal(cols.descColIndex, 3)
    assert.equal(cols.descSource, 'header')
    assert.equal(cols.qtyColIndex, 2)
    assert.equal(cols.priceColIndex, 5)
    assert.equal(cols.amountColIndex, 6)
    const cands = extractDocumentRowCandidates([t])
    assert.equal(cands.length, 1)
    assert.equal(cands[0]!.description.trim(), 'entrecot vedella')
    assert.equal(cands[0]!.quantity, 2.5)
    assert.equal(cands[0]!.unitPrice, 12.5)
  })

  it('Hielo Fenix: Producte / Preu / a cobrar', () => {
    const t = table(
      0,
      [
        { index: 0, name: 'Lliurament' },
        { index: 1, name: 'Producte' },
        { index: 2, name: 'Preu' },
        { index: 3, name: 'a cobrar' },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: '1' },
            { column_index: 1, raw_value: 'HIELO CUBITOS 2KG' },
            { column_index: 2, raw_value: '1,50' },
            { column_index: 3, raw_value: '1,50' },
          ],
        },
      ]
    )
    const cols = findColumnIndices(t)
    assert.equal(cols.descColIndex, 1)
    assert.equal(cols.priceColIndex, 2)
    assert.equal(cols.amountColIndex, 3)
    const cands = extractDocumentRowCandidates([t])
    assert.equal(cands.length, 1)
    assert.equal(cands[0]!.description, 'HIELO CUBITOS 2KG')
    assert.equal(cands[0]!.unitPrice, 1.5)
  })

  it('Otros: Article / Preu / Unitats', () => {
    const t = table(
      0,
      [
        { index: 0, name: 'Unitats' },
        { index: 1, name: 'Article' },
        { index: 2, name: 'Iva' },
        { index: 3, name: 'Preu' },
        { index: 4, name: 'Total' },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: '2' },
            { column_index: 1, raw_value: 'Yucca rostata' },
            { column_index: 2, raw_value: '10%' },
            { column_index: 3, raw_value: '159,50 €' },
            { column_index: 4, raw_value: '319,00 €' },
          ],
        },
      ]
    )
    const cols = findColumnIndices(t)
    assert.equal(cols.descColIndex, 1)
    assert.equal(cols.qtyColIndex, 0)
    assert.equal(cols.priceColIndex, 3)
    assert.equal(cols.amountColIndex, 4)
    const cands = extractDocumentRowCandidates([t])
    assert.equal(cands.length, 1)
    assert.equal(cands[0]!.description, 'Yucca rostata')
  })
  it('Ametller/Sanilec: Artículo + Descripción → prefiere Descripción (no el código)', () => {
    const t = table(
      0,
      [
        { index: 0, name: 'Artículo' },
        { index: 1, name: 'Descripción' },
        { index: 2, name: 'Cantidad' },
        { index: 3, name: 'Precio' },
        { index: 4, name: 'Importe' },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: '12345' },
            { column_index: 1, raw_value: 'Aceite Girasol 1L' },
            { column_index: 2, raw_value: '2' },
            { column_index: 3, raw_value: '3,50' },
            { column_index: 4, raw_value: '7,00' },
          ],
        },
      ]
    )
    const cols = findColumnIndices(t)
    assert.equal(cols.descColIndex, 1)
    assert.equal(cols.descSource, 'header')
    assert.match(cols.descReason ?? '', /descripcion/)
    const cands = extractDocumentRowCandidates([t])
    assert.equal(cands.length, 1)
    assert.equal(cands[0]!.description, 'Aceite Girasol 1L')
  })

  it('Panabad: ARTICLE + DESCRIPCIÓ → prefiere DESCRIPCIÓ', () => {
    const t = table(
      0,
      [
        { index: 0, name: 'ARTICLE' },
        { index: 1, name: 'DESCRIPCIÓ' },
        { index: 2, name: 'PREU' },
        { index: 3, name: 'IMPORT' },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: '1505126' },
            { column_index: 1, raw_value: 'BRIOCHE BURGER' },
            { column_index: 2, raw_value: '32,87' },
            { column_index: 3, raw_value: '142,65' },
          ],
        },
      ]
    )
    const cols = findColumnIndices(t)
    assert.equal(cols.descColIndex, 1)
    const cands = extractDocumentRowCandidates([t])
    assert.equal(cands[0]!.description, 'BRIOCHE BURGER')
  })

  it('acepta Descripció (CA) y Artículos (plural)', () => {
    const t = table(
      0,
      [
        { index: 0, name: 'Artículos' },
        { index: 1, name: 'Cantidad' },
        { index: 2, name: 'Precio' },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: 'Tomate Pera Extra' },
            { column_index: 1, raw_value: '1' },
            { column_index: 2, raw_value: '2,50' },
          ],
        },
      ]
    )
    assert.equal(findColumnIndices(t).descColIndex, 0)
    const t2 = table(
      0,
      [
        { index: 0, name: 'Descripció' },
        { index: 1, name: 'Quantitat' },
        { index: 2, name: 'Preu' },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: 'Pa de pagès' },
            { column_index: 1, raw_value: '2' },
            { column_index: 2, raw_value: '1,20' },
          ],
        },
      ]
    )
    const cols2 = findColumnIndices(t2)
    assert.equal(cols2.descColIndex, 0)
    assert.equal(cols2.qtyColIndex, 1)
    assert.equal(cols2.priceColIndex, 2)
  })
})

describe('evidence-column-heuristics descripción sin header', () => {
  it('Nestle: descripción en columna sin nombre (SKU + producto + Cantidad/Precio)', () => {
    const t = table(
      0,
      [
        { index: 0, name: null },
        { index: 1, name: null },
        { index: 2, name: 'Cantidad' },
        { index: 3, name: 'Precio' },
        { index: 4, name: '%Dto' },
        { index: 5, name: 'Importe' },
        { index: 6, name: null },
        { index: 7, name: null },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: '031027686' },
            { column_index: 1, raw_value: 'PIRULO TROPICALN1 20x70ml' },
            { column_index: 2, raw_value: '1,00 CJ' },
            { column_index: 3, raw_value: '27,000' },
            { column_index: 4, raw_value: '20,00' },
            { column_index: 5, raw_value: '21,60' },
            { column_index: 6, raw_value: 'Lote:AR5346' },
            { column_index: 7, raw_value: 'Cad:31/12/27' },
          ],
        },
        {
          index: 1,
          cells: [
            { column_index: 0, raw_value: '031015496' },
            { column_index: 1, raw_value: 'PIR FANTASMIKOS NS 18X75' },
            { column_index: 2, raw_value: '1,00 CJ' },
            { column_index: 3, raw_value: '24,840' },
            { column_index: 4, raw_value: '20,00' },
            { column_index: 5, raw_value: '19,87' },
            { column_index: 6, raw_value: 'Lote:AR6064' },
            { column_index: 7, raw_value: 'Cad:31/03/28' },
          ],
        },
      ]
    )
    const cols = findColumnIndices(t)
    assert.equal(cols.descColIndex, 1)
    assert.equal(cols.descSource, 'inferred')
    assert.ok(cols.descConfidence >= 0.72)
    assert.equal(cols.qtyColIndex, 2)
    assert.equal(cols.priceColIndex, 3)
    const cands = extractDocumentRowCandidates([t])
    assert.equal(cands.length, 2)
    assert.match(cands[0]!.description, /PIRULO/)
    assert.equal(cands[0]!.descSource, 'inferred')
  })

  it('Nestle: producto con Lote: en 2ª línea no se trata como columna de fechas', () => {
    const t = table(
      0,
      [
        { index: 0, name: null },
        { index: 1, name: 'Cantidad' },
        { index: 2, name: null },
        { index: 3, name: 'Precio' },
        { index: 4, name: '%Dto' },
        { index: 5, name: 'Importe' },
        { index: 6, name: null },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: '031015496' },
            { column_index: 1, raw_value: '1,00 CJ' },
            { column_index: 2, raw_value: 'PIR FANTASNIKOS N5 18X75\nLote:AR6071' },
            { column_index: 3, raw_value: '24,840' },
            { column_index: 4, raw_value: '20,00' },
            { column_index: 5, raw_value: '19,87' },
            { column_index: 6, raw_value: 'Cad:31/03/23' },
          ],
        },
        {
          index: 1,
          cells: [
            { column_index: 0, raw_value: '031027916' },
            { column_index: 1, raw_value: '1,00 CJ' },
            { column_index: 2, raw_value: 'NUII CRM AUSTRAL.N4 20X90\nLote:MI6062' },
            { column_index: 3, raw_value: '45,400' },
            { column_index: 4, raw_value: '20,00' },
            { column_index: 5, raw_value: '36,32' },
            { column_index: 6, raw_value: 'Cad:31/03/28' },
          ],
        },
      ]
    )
    const cols = findColumnIndices(t)
    assert.equal(cols.descColIndex, 2)
    assert.equal(cols.descSource, 'inferred')
    const cands = extractDocumentRowCandidates([t])
    assert.equal(cands.length, 2)
    assert.equal(cands[0]!.description, 'PIR FANTASNIKOS N5 18X75')
    assert.doesNotMatch(cands[0]!.description, /Lote/)
  })

  it('Videla: descripción en columna 0 sin header', () => {
    const t = table(
      0,
      [
        { index: 0, name: null },
        { index: 1, name: '%Iva' },
        { index: 2, name: 'Unidades' },
        { index: 3, name: 'Precio' },
        { index: 4, name: 'Importe' },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: 'TERNERA MASA HAMBURGUESA' },
            { column_index: 1, raw_value: '10' },
            { column_index: 2, raw_value: '2,11 KG' },
            { column_index: 3, raw_value: '9,99' },
            { column_index: 4, raw_value: '21,08' },
          ],
        },
        {
          index: 1,
          cells: [
            { column_index: 0, raw_value: 'CALAMAR CONG. Calamar patagónico' },
            { column_index: 1, raw_value: '10' },
            { column_index: 2, raw_value: '2,00 BU' },
            { column_index: 3, raw_value: '10,40' },
            { column_index: 4, raw_value: '101,40' },
          ],
        },
      ]
    )
    const cols = findColumnIndices(t)
    assert.equal(cols.descColIndex, 0)
    assert.equal(cols.descSource, 'inferred')
    const cands = extractDocumentRowCandidates([t])
    assert.equal(cands.length, 2)
  })

  it('Panabad: headers vacíos pero contenido descriptivo en una columna', () => {
    const t = table(
      0,
      [
        { index: 0, name: null },
        { index: 1, name: null },
        { index: 2, name: null },
        { index: 3, name: null },
        { index: 4, name: null },
        { index: 5, name: null },
        { index: 6, name: null },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: '1505126' },
            { column_index: 1, raw_value: 'BRIOCHE BURGER' },
            { column_index: 2, raw_value: '40 uds.' },
            { column_index: 3, raw_value: '7,000' },
            { column_index: 4, raw_value: 'CAJA' },
            { column_index: 5, raw_value: '32,87' },
            { column_index: 6, raw_value: '142,65' },
          ],
        },
        {
          index: 1,
          cells: [
            { column_index: 0, raw_value: '1530007' },
            { column_index: 1, raw_value: 'BOCATA MEDITERRANEO' },
            { column_index: 2, raw_value: '60 Uds.' },
            { column_index: 3, raw_value: '1,000' },
            { column_index: 4, raw_value: 'CAJA' },
            { column_index: 5, raw_value: '43,98' },
            { column_index: 6, raw_value: '32,98' },
          ],
        },
        {
          index: 2,
          cells: [
            { column_index: 0, raw_value: '1501001' },
            { column_index: 1, raw_value: 'BAGUETTE RUSTICA' },
            { column_index: 2, raw_value: '20 Uds.' },
            { column_index: 3, raw_value: '2,000' },
            { column_index: 4, raw_value: 'CAJA' },
            { column_index: 5, raw_value: '10,00' },
            { column_index: 6, raw_value: '20,00' },
          ],
        },
      ]
    )
    const cols = findColumnIndices(t)
    assert.equal(cols.descColIndex, 1)
    assert.equal(cols.descSource, 'inferred')
    const cands = extractDocumentRowCandidates([t])
    assert.equal(cands.length, 3)
    assert.ok(cands.every((c) => c.descSource === 'inferred'))
  })

  it('no fuerza descripción si hay dos columnas de texto plausibles', () => {
    const t = table(
      0,
      [
        { index: 0, name: null },
        { index: 1, name: null },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: 'TOMATE RAF EXTRA' },
            { column_index: 1, raw_value: 'PROVEEDOR HUERTA SUR' },
          ],
        },
        {
          index: 1,
          cells: [
            { column_index: 0, raw_value: 'LECHUGA ICEBERG' },
            { column_index: 1, raw_value: 'PROVEEDOR HUERTA NORTE' },
          ],
        },
        {
          index: 2,
          cells: [
            { column_index: 0, raw_value: 'CEBOLLA DULCE' },
            { column_index: 1, raw_value: 'PROVEEDOR HUERTA ESTE' },
          ],
        },
      ]
    )
    const cols = findColumnIndices(t)
    assert.equal(cols.descColIndex, -1)
    assert.equal(cols.descSource, 'none')
    assert.equal(extractDocumentRowCandidates([t]).length, 0)
  })
})

describe('evidence-column-heuristics filas basura', () => {
  it('detecta basura conocida', () => {
    assert.equal(isGarbageDocumentDescription('CONTIENE SULFITOS'), true)
    assert.equal(isGarbageDocumentDescription('null'), true)
    assert.equal(isGarbageDocumentDescription('SUBTOTAL'), true)
    assert.equal(isGarbageDocumentDescription('Total'), true)
    assert.equal(isGarbageDocumentDescription('Base imponible'), true)
    assert.equal(isGarbageDocumentDescription('IVA'), true)
  })

  it('no marca artículos reales cortos como basura', () => {
    assert.equal(isGarbageDocumentDescription('HIELO'), false)
    assert.equal(isGarbageDocumentDescription('CAVA'), false)
    assert.equal(isGarbageDocumentDescription('Yucca rostata'), false)
  })

  it('excluye basura y conserva fila real', () => {
    const t = table(
      0,
      [
        { index: 0, name: 'Descripción' },
        { index: 1, name: 'Cantidad' },
        { index: 2, name: 'Precio' },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: 'CONTIENE SULFITOS' },
            { column_index: 1, raw_value: '1' },
            { column_index: 2, raw_value: '0' },
          ],
        },
        {
          index: 1,
          cells: [
            { column_index: 0, raw_value: 'null' },
            { column_index: 1, raw_value: '1' },
            { column_index: 2, raw_value: '0' },
          ],
        },
        {
          index: 2,
          cells: [
            { column_index: 0, raw_value: 'SUBTOTAL' },
            { column_index: 1, raw_value: '' },
            { column_index: 2, raw_value: '10' },
          ],
        },
        {
          index: 3,
          cells: [
            { column_index: 0, raw_value: 'VINO TINTO CRIANZA' },
            { column_index: 1, raw_value: '6' },
            { column_index: 2, raw_value: '4,50' },
          ],
        },
      ]
    )
    const cands = extractDocumentRowCandidates([t])
    assert.equal(cands.length, 1)
    assert.equal(cands[0]!.description, 'VINO TINTO CRIANZA')
  })
})

describe('evidence-column-heuristics regresión headers castellanos → matcher', () => {
  it('tabla castellana clásica produce el mismo MATCH que antes', () => {
    const t = table(
      0,
      [
        { index: 0, name: 'Descripción' },
        { index: 1, name: 'Cantidad' },
        { index: 2, name: 'Precio' },
        { index: 3, name: 'Unidad' },
      ],
      [
        {
          index: 0,
          cells: [
            { column_index: 0, raw_value: 'Aceite Girasol 25 L' },
            { column_index: 1, raw_value: '1' },
            { column_index: 2, raw_value: '48,49' },
            { column_index: 3, raw_value: 'ud' },
          ],
        },
        {
          index: 1,
          cells: [
            { column_index: 0, raw_value: 'Aceite Oliva Suave 5 L' },
            { column_index: 1, raw_value: '1' },
            { column_index: 2, raw_value: '25,25' },
            { column_index: 3, raw_value: 'ud' },
          ],
        },
      ]
    )
    const cands = extractDocumentRowCandidates([t])
    assert.equal(cands.length, 2)
    assert.ok(cands.every((c) => c.descSource === 'header'))

    const docRows: DocumentRowForMatch[] = cands.map((c, orderIndex) => ({
      rowMappingKey: c.rowMappingKey,
      description: c.description,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
      unit: c.unit,
      orderIndex,
    }))
    const lines: OperativeLineForMatch[] = [
      {
        id: 'l1',
        original_name: 'Aceite Girasol 25 L',
        quantity: 1,
        unit_price: 48.49,
        total_price: 48.49,
        line_unit: 'ud',
        status: 'mapped',
        orderIndex: 0,
      },
      {
        id: 'l2',
        original_name: 'Aceite Oliva Suave 5 L',
        quantity: 1,
        unit_price: 25.25,
        total_price: 25.25,
        line_unit: 'ud',
        status: 'mapped',
        orderIndex: 1,
      },
    ]
    const result = matchHistoricalRows(docRows, lines)
    assert.equal(result.matches.length, 2)
    assert.equal(result.ambiguous.length, 0)
    assert.equal(result.noMatch.length, 0)
  })
})
