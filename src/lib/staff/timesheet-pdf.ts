/**
 * PDF oficial de jornada laboral — Design System v2.0
 * Registro conforme al art. 34.9 ET. Simulación plantilla reutiliza este generador.
 */

import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { jsPDF } from 'jspdf'
import {
  createDsDocument,
  drawKpiRow,
  dsTableStyles,
  DS_COMPANY,
  DS_RGB,
  DS_SPACE,
  DS_TYPE,
  type PageGeom,
} from '../pdf/design-system-v2/index.ts'
import type { TimesheetExportPayload } from './timesheet-export-payload'

const WORK_CENTER = 'Bar La Marbella — Barcelona'

const LEGAL_FOOTER =
  'Documento generado por Marbella OS. Registro de jornada conforme al art. 34.9 del Estatuto de los Trabajadores.'

const WEEKDAY_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function isoToDisplay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

function fmtMinutes(minutes: number): string {
  if (minutes <= 0) return ' '
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')} min`
}

function fmtMinutesCompact(minutes: number): string {
  if (minutes <= 0) return '0 h'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

function fmtMonthYear(year: number, month0: number): string {
  const d = new Date(year, month0, 1)
  const raw = format(d, 'MMMM yyyy', { locale: es })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function buildExportId(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `EXP-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function loadImageAsDataUrl(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function estadoLabel(eventType: string): string {
  return eventType === 'adjustment' ? 'Baja' : 'Regular'
}

function periodTitle(payload: TimesheetExportPayload): string {
  return (
    payload.periodLabel ??
    fmtMonthYear(payload.periodYear, payload.periodMonth)
  ).toUpperCase()
}

function drawEmployeeMeta(
  doc: jsPDF,
  geom: PageGeom,
  y: number,
  fullName: string,
  dni: string | null,
): number {
  const labelW = 72
  const col2 = geom.contentLeft + geom.contentW / 2

  doc.setFont(DS_TYPE.fontFamily, 'normal')
  doc.setFontSize(DS_TYPE.caption)
  doc.setTextColor(...DS_RGB.grayMid)
  doc.text('EMPLEADO', geom.contentLeft, y)
  doc.setFont(DS_TYPE.fontFamily, 'bold')
  doc.setFontSize(DS_TYPE.body)
  doc.setTextColor(...DS_RGB.grayDark)
  doc.text(fullName, geom.contentLeft + labelW, y)

  if (dni) {
    doc.setFont(DS_TYPE.fontFamily, 'normal')
    doc.setFontSize(DS_TYPE.caption)
    doc.setTextColor(...DS_RGB.grayMid)
    doc.text('DNI / NIE', col2, y)
    doc.setFont(DS_TYPE.fontFamily, 'bold')
    doc.setFontSize(DS_TYPE.body)
    doc.setTextColor(...DS_RGB.grayDark)
    doc.text(dni, col2 + labelW, y)
  }

  const y2 = y + DS_SPACE.sm
  doc.setFont(DS_TYPE.fontFamily, 'normal')
  doc.setFontSize(DS_TYPE.caption)
  doc.setTextColor(...DS_RGB.grayMid)
  doc.text('CENTRO', geom.contentLeft, y2)
  doc.setFont(DS_TYPE.fontFamily, 'normal')
  doc.setFontSize(DS_TYPE.body)
  doc.setTextColor(...DS_RGB.grayDark)
  doc.text(WORK_CENTER, geom.contentLeft + labelW, y2)

  return y2 + DS_SPACE.md
}

function drawTimesheetTable(
  doc: jsPDF,
  geom: PageGeom,
  payload: TimesheetExportPayload,
  startY: number,
): number {
  const body = payload.rows.map((row) => [
    isoToDisplay(row.date),
    WEEKDAY_ES[row.weekday] ?? '',
    estadoLabel(row.eventType),
    row.eventType === 'adjustment' ? ' ' : (row.clockIn ?? ' '),
    row.eventType === 'adjustment' ? ' ' : (row.clockOut ?? ' '),
    fmtMinutes(row.displayMinutes),
  ])

  autoTable(doc, {
    ...dsTableStyles({
      headStyles: {
        fillColor: DS_RGB.brand,
        textColor: DS_RGB.white,
        fontStyle: 'bold',
        fontSize: DS_TYPE.caption,
        cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
      },
      styles: {
        font: DS_TYPE.fontFamily,
        fontSize: 8,
        textColor: DS_RGB.grayDark,
        cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
        valign: 'middle',
        overflow: 'linebreak',
      },
    }),
    startY,
    margin: { left: geom.contentLeft, right: geom.marginX, bottom: geom.pageH - geom.contentBottom + 8 },
    head: [['Fecha', 'Día', 'Estado', 'Entrada', 'Salida', 'Horas']],
    body,
    columnStyles: {
      0: { cellWidth: 70, halign: 'left' },
      1: { cellWidth: 90, halign: 'left' },
      2: { cellWidth: 70, halign: 'left' },
      3: { cellWidth: 55, halign: 'center' },
      4: { cellWidth: 55, halign: 'center' },
      5: { cellWidth: 'auto' as unknown as number, halign: 'right' },
    },
  })

  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY
}

function stampContinuation(
  doc: jsPDF,
  geom: PageGeom,
  label: string,
): void {
  doc.setFont(DS_TYPE.fontFamily, 'normal')
  doc.setFontSize(DS_TYPE.caption)
  doc.setTextColor(...DS_RGB.grayMid)
  doc.text(label, geom.contentLeft, geom.contentTop - 10)
}

/**
 * Construye el documento PDF de jornada (sin guardar).
 */
export async function createTimesheetPdfDocument(
  payload: TimesheetExportPayload,
  logoDataUrl: string | null,
): Promise<jsPDF> {
  const exportId = buildExportId(payload.generatedAt)
  const period = periodTitle(payload)
  const genDate = isoToDisplay(payload.generatedAt.toISOString().slice(0, 10))
  const genTime = `${String(payload.generatedAt.getHours()).padStart(2, '0')}:${String(payload.generatedAt.getMinutes()).padStart(2, '0')}`

  const { doc, geom, cursorY, paintChromeAll } = createDsDocument({
    documentTitle: `JORNADA · ${period}`,
    footerLabel: `${exportId} · ${DS_COMPANY.tradeName}`,
    footerSubline: `${LEGAL_FOOTER} Generado el ${genDate} a las ${genTime} h.`,
    logoDataUrl,
    logoOnPlate: true,
  })

  let y = cursorY
  doc.setFont(DS_TYPE.fontFamily, 'bold')
  doc.setFontSize(DS_TYPE.section)
  doc.setTextColor(...DS_RGB.grayDark)
  doc.text('Informe de registro de jornada laboral', geom.contentLeft, y)
  y += DS_SPACE.lg

  y = drawEmployeeMeta(doc, geom, y, payload.employeeFullName, payload.employeeDni)

  y =
    drawKpiRow(doc, y, [
      { label: 'Jornadas trabajadas', value: String(payload.totalDays) },
      { label: 'Total horas', value: fmtMinutesCompact(payload.totalDisplayMinutes) },
    ]) + DS_SPACE.md

  drawTimesheetTable(doc, geom, payload, y)
  paintChromeAll()

  const totalPages = doc.getNumberOfPages()
  for (let p = 2; p <= totalPages; p++) {
    doc.setPage(p)
    stampContinuation(
      doc,
      geom,
      `${payload.employeeFullName} · ${period} (cont.)`,
    )
  }

  return doc
}

export async function generateTimesheetPdf(payload: TimesheetExportPayload): Promise<void> {
  const logoDataUrl = await loadImageAsDataUrl('/icons/logo-white.png')
  const doc = await createTimesheetPdfDocument(payload, logoDataUrl)

  const monthLabel = format(new Date(payload.periodYear, payload.periodMonth, 1), 'yyyy-MM')
  const employeeSlug = payload.employeeFullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')

  doc.save(`jornada_${employeeSlug}_${monthLabel}.pdf`)
}

export async function generateTimesheetPdfMulti(
  payloads: Array<{
    employee: { fullName: string; dni: string | null }
    payload: TimesheetExportPayload
  }>,
): Promise<void> {
  if (payloads.length === 0) return

  const firstPayload = payloads[0].payload
  const exportId = buildExportId(firstPayload.generatedAt)
  const periodLabel = firstPayload.periodLabel ?? fmtMonthYear(firstPayload.periodYear, firstPayload.periodMonth)
  const period = periodLabel.toUpperCase()
  const logoDataUrl = await loadImageAsDataUrl('/icons/logo-white.png')
  const genDate = isoToDisplay(firstPayload.generatedAt.toISOString().slice(0, 10))
  const genTime = `${String(firstPayload.generatedAt.getHours()).padStart(2, '0')}:${String(firstPayload.generatedAt.getMinutes()).padStart(2, '0')}`

  const { doc, geom, cursorY, addPage, paintChromeAll, chrome } = createDsDocument({
    documentTitle: `JORNADA PLANTILLA · ${period}`,
    footerLabel: `${exportId} · ${DS_COMPANY.tradeName}`,
    footerSubline: `${LEGAL_FOOTER} Generado el ${genDate} a las ${genTime} h.`,
    logoDataUrl,
    logoOnPlate: true,
  })

  let y = cursorY
  doc.setFont(DS_TYPE.fontFamily, 'bold')
  doc.setFontSize(DS_TYPE.section)
  doc.setTextColor(...DS_RGB.grayDark)
  doc.text('Informe de registro de jornada laboral — Plantilla', geom.contentLeft, y)
  y += DS_SPACE.lg

  for (let i = 0; i < payloads.length; i++) {
    const { employee, payload } = payloads[i]

    if (i > 0) {
      y = addPage()
      stampContinuation(doc, geom, `${DS_COMPANY.tradeName} · ${period} · Plantilla (cont.)`)
      y += DS_SPACE.xs
    }

    doc.setFont(DS_TYPE.fontFamily, 'bold')
    doc.setFontSize(DS_TYPE.subtitle)
    doc.setTextColor(...DS_RGB.brand)
    doc.text(`${i + 1}. ${employee.fullName}`, geom.contentLeft, y)
    y += DS_SPACE.md

    y = drawEmployeeMeta(doc, geom, y, employee.fullName, employee.dni)
    y =
      drawKpiRow(doc, y, [
        { label: 'Jornadas trabajadas', value: String(payload.totalDays) },
        { label: 'Total horas', value: fmtMinutesCompact(payload.totalDisplayMinutes) },
      ]) + DS_SPACE.md

    y = drawTimesheetTable(doc, geom, payload, y) + DS_SPACE.lg
  }

  // Re-aplicar chrome con el mismo título (addPage ya pintó páginas intermedias)
  Object.assign(chrome, {
    documentTitle: `JORNADA PLANTILLA · ${period}`,
  })
  paintChromeAll()

  const fileSlug = periodLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_|_$/g, '')
  doc.save(`jornada_plantilla_${fileSlug}.pdf`)
}
