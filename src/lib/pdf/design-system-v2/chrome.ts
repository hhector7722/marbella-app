/**
 * Cabecera y pie — Design System v2.0
 * Continuidad discreta: nunca compiten con el contenido.
 */

import type { jsPDF } from 'jspdf'
import { getPageGeom, type PageGeom } from './layout.ts'
import { DS_COMPANY, DS_PAGE, DS_RGB, DS_SPACE, DS_TYPE, DS_V2_VERSION } from './tokens.ts'

export type ChromeOptions = {
  /** Título del documento (derecha en cabecera), p.ej. "INFORME SEMANAL · 20-26 JUL" */
  documentTitle: string
  /** Nombre corto en pie izquierdo */
  footerLabel?: string
  /** Línea legal / nota bajo el pie (caption, izquierda) */
  footerSubline?: string
  /** Versión opcional centrada en pie */
  version?: string
  /** Wordmark / marca en cabecera izquierda */
  brandLabel?: string
  /** DataURL PNG/JPEG del logo (opcional; si falta se usa wordmark) */
  logoDataUrl?: string | null
  /** Si el logo es claro sobre fondo blanco, dibuja placa gris detrás */
  logoOnPlate?: boolean
  geom?: PageGeom
}

function geomOrDefault(doc: jsPDF, geom?: PageGeom): PageGeom {
  if (geom) return geom
  return getPageGeom(doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight())
}

/** Dibuja cabecera en la página actual. Devuelve Y de inicio de contenido. */
export function drawHeader(doc: jsPDF, opts: ChromeOptions): number {
  const g = geomOrDefault(doc, opts.geom)
  const brand = opts.brandLabel ?? DS_COMPANY.brandName
  const yLogo = g.marginY + 4

  if (opts.logoDataUrl) {
    try {
      const h = 18
      const w = 18
      if (opts.logoOnPlate !== false) {
        doc.setFillColor(...DS_RGB.grayLight)
        doc.roundedRect(g.contentLeft, yLogo, w, h, 2, 2, 'F')
      }
      doc.addImage(opts.logoDataUrl, 'PNG', g.contentLeft, yLogo, w, h)
    } catch {
      doc.setFont(DS_TYPE.fontFamily, 'bold')
      doc.setFontSize(11)
      doc.setTextColor(...DS_RGB.grayDark)
      doc.text(brand, g.contentLeft, yLogo + 12)
    }
  } else {
    doc.setFont(DS_TYPE.fontFamily, 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...DS_RGB.grayDark)
    doc.text(brand, g.contentLeft, yLogo + 12)
  }

  doc.setFont(DS_TYPE.fontFamily, 'normal')
  doc.setFontSize(DS_TYPE.caption)
  doc.setTextColor(...DS_RGB.grayMid)
  doc.text(opts.documentTitle.toUpperCase(), g.contentRight, yLogo + 12, { align: 'right' })

  const lineY = g.marginY + g.headerH - 8
  doc.setDrawColor(...DS_RGB.grayLight)
  doc.setLineWidth(DS_PAGE.hairline)
  doc.line(g.contentLeft, lineY, g.contentRight, lineY)

  return g.contentTop
}

/** Dibuja pie en la página actual. */
export function drawFooter(doc: jsPDF, opts: ChromeOptions & { pageNumber?: number }): void {
  const g = geomOrDefault(doc, opts.geom)
  const pageNumber =
    opts.pageNumber ??
    (typeof doc.getCurrentPageInfo === 'function'
      ? doc.getCurrentPageInfo().pageNumber
      : doc.getNumberOfPages())

  const lineY = g.contentBottom + DS_SPACE.sm
  doc.setDrawColor(...DS_RGB.grayLight)
  doc.setLineWidth(DS_PAGE.hairline)
  doc.line(g.contentLeft, lineY, g.contentRight, lineY)

  const textY = lineY + 14
  doc.setFont(DS_TYPE.fontFamily, 'normal')
  doc.setFontSize(DS_TYPE.caption)
  doc.setTextColor(...DS_RGB.grayMid)

  const left = opts.footerLabel ?? opts.documentTitle
  doc.text(left, g.contentLeft, textY)

  const version = opts.version ?? `v${DS_V2_VERSION}`
  doc.text(version, g.pageW / 2, textY, { align: 'center' })

  doc.text(String(pageNumber).padStart(2, '0'), g.contentRight, textY, { align: 'right' })

  if (opts.footerSubline) {
    doc.setFontSize(6.5)
    doc.setTextColor(...DS_RGB.grayMid)
    const sub = doc.splitTextToSize(opts.footerSubline, g.contentW)
    doc.text(sub, g.contentLeft, textY + 10)
  }
}

/** Aplica cabecera + pie a todas las páginas existentes. */
export function applyChromeToAllPages(doc: jsPDF, opts: ChromeOptions): void {
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    drawHeader(doc, opts)
    drawFooter(doc, { ...opts, pageNumber: i })
  }
}
