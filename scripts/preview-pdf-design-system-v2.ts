/**
 * Preview visual del PDF Design System v2.0.
 * No altera generadores legacy. Solo valida el kit nuevo.
 *
 * Uso:
 *   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     scripts/preview-pdf-design-system-v2.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import autoTable from 'jspdf-autotable'
import {
  createDsDocument,
  drawAlert,
  drawBlockSubtitle,
  drawBlockTitle,
  drawKpiRow,
  drawSectionCover,
  dsTableStyles,
  formatEuro,
  formatNumber,
  DS_SPACE,
} from '../src/lib/pdf/design-system-v2/index.ts'

async function main() {
  const { doc, geom, cursorY, addPage, paintChromeAll } = createDsDocument({
    documentTitle: 'INFORME SEMANAL · 20–26 JUL',
    footerLabel: 'Marbella PDF Design System',
  })

  let y = drawBlockTitle(doc, 'Informe Semanal · Bar La Marbella', geom.contentLeft, cursorY)
  y = drawBlockSubtitle(
    doc,
    '20–26 de julio de 2026 · Página de ejemplo a escala real',
    geom.contentLeft,
    y,
  )
  y += DS_SPACE.sm

  y =
    drawKpiRow(doc, y, [
      { label: 'Ventas semana', value: formatEuro(18240, 0), delta: '▲ 8,6%', tone: 'up' },
      { label: 'Tickets', value: formatNumber(2184), delta: '▲ 3,2%', tone: 'up' },
      { label: 'Ticket medio', value: formatEuro(8.35), delta: '▼ 1,1%', tone: 'down' },
      { label: 'Margen bruto', value: '31,4%', delta: '▲ 1,2 pp', tone: 'up' },
    ]) + DS_SPACE.md

  y =
    drawAlert(doc, {
      kind: 'warning',
      message: '2 referencias con stock por debajo del mínimo — revisar antes del pedido del lunes.',
      x: geom.contentLeft,
      y,
      w: geom.contentW,
    }) + DS_SPACE.lg

  autoTable(doc, {
    ...dsTableStyles(),
    startY: y,
    margin: { left: geom.contentLeft, right: geom.marginX },
    head: [['Categoría', 'Unidades', 'Importe']],
    body: [
      ['Bebidas frías', formatNumber(482), formatEuro(1920.4)],
      ['Cafetería', formatNumber(311), formatEuro(932.1)],
      ['Tapas y raciones', formatNumber(204), formatEuro(1428.6)],
      ['Postres', formatNumber(96), formatEuro(312)],
    ],
    foot: [['Total', formatNumber(1093), formatEuro(4593.1)]],
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right', cellWidth: 80 },
      2: { halign: 'right', cellWidth: 100 },
    },
  })

  addPage()
  drawSectionCover(doc, {
    blockLabel: 'Bloque 01',
    title: 'Ventas',
    subtitle: 'Evolución semanal y comparativa',
    geom,
  })

  paintChromeAll()

  const outDir = join(process.cwd(), 'tmp')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'preview-design-system-v2.pdf')
  const buf = Buffer.from(doc.output('arraybuffer'))
  writeFileSync(outPath, buf)
  console.log(`OK → ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
