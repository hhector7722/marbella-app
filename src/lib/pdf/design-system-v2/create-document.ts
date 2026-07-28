/**
 * Factory de documentos PDF nuevos — Design System v2.0
 *
 * USAR este módulo para cualquier PDF NUEVO.
 * NO importar desde generadores legacy (pedidos, timesheet, encargos, etc.).
 */

import { jsPDF } from 'jspdf'
import { applyChromeToAllPages, drawFooter, drawHeader, type ChromeOptions } from './chrome.ts'
import { getPageGeom, type PageGeom } from './layout.ts'
import { DS_COMPANY, DS_PAGE, DS_V2_VERSION } from './tokens.ts'

export type CreateDsDocumentOptions = {
  /** Título que aparece en cabecera (derecha) */
  documentTitle: string
  footerLabel?: string
  footerSubline?: string
  version?: string
  logoDataUrl?: string | null
  logoOnPlate?: boolean
}

export type DsDocument = {
  doc: jsPDF
  geom: PageGeom
  chrome: ChromeOptions
  /** Y actual sugerido tras cabecera de la 1ª página */
  cursorY: number
  /** Cabecera + pie en la página actual */
  paintChrome: (pageNumber?: number) => void
  /** Cabecera + pie en todas las páginas */
  paintChromeAll: () => void
  /** Añade página y repinta chrome; devuelve Y de contenido */
  addPage: () => number
}

export function createDsDocument(opts: CreateDsDocumentOptions): DsDocument {
  const doc = new jsPDF({
    orientation: DS_PAGE.orientation,
    unit: DS_PAGE.unit,
    format: DS_PAGE.format,
  })

  const geom = getPageGeom(doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight())
  const chrome: ChromeOptions = {
    documentTitle: opts.documentTitle,
    footerLabel: opts.footerLabel ?? `${DS_COMPANY.tradeName}`,
    footerSubline: opts.footerSubline,
    version: opts.version ?? `v${DS_V2_VERSION}`,
    logoDataUrl: opts.logoDataUrl,
    logoOnPlate: opts.logoOnPlate,
    geom,
  }

  const paintChrome = (pageNumber?: number) => {
    drawHeader(doc, chrome)
    drawFooter(doc, { ...chrome, pageNumber })
  }

  paintChrome(1)

  return {
    doc,
    geom,
    chrome,
    cursorY: geom.contentTop,
    paintChrome,
    paintChromeAll: () => applyChromeToAllPages(doc, chrome),
    addPage: () => {
      doc.addPage()
      const pageNumber = doc.getNumberOfPages()
      paintChrome(pageNumber)
      return geom.contentTop
    },
  }
}

/** Formato numérico ES (miles con punto, decimal con coma). */
export function formatEuro(n: number, digits = 2): string {
  return (
    n.toLocaleString('es-ES', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }) + ' €'
  )
}

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString('es-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}
