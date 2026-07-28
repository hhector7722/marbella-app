/**
 * Retícula y geometría de página — Design System v2.0
 */

import { DS_PAGE } from './tokens.ts'

export type PageGeom = {
  pageW: number
  pageH: number
  marginX: number
  marginY: number
  contentW: number
  contentH: number
  colW: number
  gutter: number
  textMaxW: number
  /** X del borde izquierdo del contenido */
  contentLeft: number
  /** X del borde derecho del contenido */
  contentRight: number
  /** Y bajo cabecera (zona útil) */
  contentTop: number
  /** Y encima del pie */
  contentBottom: number
  headerH: number
  footerH: number
}

/** Altura reservada para chrome (cabecera + pie) */
const HEADER_BLOCK = 40
const FOOTER_BLOCK = 36

export function getPageGeom(
  pageW: number = DS_PAGE.width,
  pageH: number = DS_PAGE.height,
): PageGeom {
  const { marginX, marginY, columns, gutter, textColumns } = DS_PAGE
  const contentW = pageW - marginX * 2
  const contentH = pageH - marginY * 2
  const colW = (contentW - gutter * (columns - 1)) / columns
  const textMaxW = textColumns * colW + (textColumns - 1) * gutter

  return {
    pageW,
    pageH,
    marginX,
    marginY,
    contentW,
    contentH,
    colW,
    gutter,
    textMaxW,
    contentLeft: marginX,
    contentRight: pageW - marginX,
    contentTop: marginY + HEADER_BLOCK,
    contentBottom: pageH - marginY - FOOTER_BLOCK,
    headerH: HEADER_BLOCK,
    footerH: FOOTER_BLOCK,
  }
}

/** X de inicio de la columna 1-based (1…12) */
export function columnX(geom: PageGeom, col: number): number {
  const c = Math.max(1, Math.min(DS_PAGE.columns, col))
  return geom.contentLeft + (c - 1) * (geom.colW + geom.gutter)
}

/** Ancho que ocupa `span` columnas desde `col` */
export function columnSpanWidth(geom: PageGeom, span: number): number {
  const s = Math.max(1, Math.min(DS_PAGE.columns, span))
  return s * geom.colW + (s - 1) * geom.gutter
}

/** Multiplo de 8 pt (retícula) */
export function snap8(n: number): number {
  return Math.round(n / 8) * 8
}
