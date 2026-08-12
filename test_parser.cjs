function parseInvoiceLinesFromTables(
  tables,
  rowMapping,
  invoiceId,
  headerTaxRate
) {
  const linesToInsert = []

  for (const table of tables || []) {
    let descColIndex = -1
    let qtyColIndex = -1
    let priceColIndex = -1
    let unitColIndex = -1

    for (const col of table.columns || []) {
      const name = (col.name || '').toLowerCase()
      if (/descripci|art[íi]culo|producto|concepto|nombre/i.test(name)) descColIndex = col.index
      else if (/cant|uds|unidades|emb|cajas|bultos/i.test(name)) qtyColIndex = col.index
      // Fix: removed 'importe' to prevent it from overwriting the unit price
      else if (/precio|tarifa/i.test(name)) priceColIndex = col.index
      else if (/unidad|um|unid/i.test(name)) unitColIndex = col.index
    }

    if (descColIndex === -1) continue

    for (const row of table.rows || []) {
      let desc = ''
      let qty = 0
      let price = 0
      let unit = ''

      for (const cell of row.cells || []) {
        if (cell.column_index === descColIndex) desc = cell.raw_value || ''
        if (cell.column_index === qtyColIndex) {
          const val = parseFloat((cell.raw_value || '').replace(',', '.'))
          if (!isNaN(val)) qty = val
        }
        if (cell.column_index === priceColIndex) {
          const val = parseFloat((cell.raw_value || '').replace(',', '.'))
          if (!isNaN(val)) price = val
        }
        if (cell.column_index === unitColIndex) {
          unit = cell.raw_value || ''
        }
      }

      if (!desc.trim()) continue

      linesToInsert.push({
        quantity: qty,
        unit_price: price,
        total_price: qty * price,
      })
    }
  }

  return linesToInsert
}

const mockTables = [
  {
    index: 0,
    columns: [
      { index: 0, name: "DESCRIPCIÓN" },
      { index: 1, name: "CANTIDAD" },
      { index: 2, name: "PRECIO" },
      { index: 3, name: "IMPORTE" },
      { index: 4, name: "NETO" }
    ],
    rows: [
      {
        index: 0,
        cells: [
          { column_index: 0, raw_value: "Patata Agria Saco Entero 10 Kg" },
          { column_index: 1, raw_value: "40,000 KG" },
          { column_index: 2, raw_value: "0,980" },
          { column_index: 3, raw_value: "39,20" },
          { column_index: 4, raw_value: "39,20" }
        ]
      },
      {
        index: 1,
        cells: [
          { column_index: 0, raw_value: "Other item" },
          { column_index: 1, raw_value: "6" },
          { column_index: 2, raw_value: "14,00" },
          { column_index: 3, raw_value: "84,00" },
          { column_index: 4, raw_value: "84,00" }
        ]
      }
    ]
  }
]

const result = parseInvoiceLinesFromTables(mockTables, {}, "test-id", null)
console.log(JSON.stringify(result, null, 2))
