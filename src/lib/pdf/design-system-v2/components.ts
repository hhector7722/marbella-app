/**
 * Componentes editoriales — Design System v2.0
 * KPI, tablas (estilos autoTable), alertas, portadas de sección.
 */

import type { jsPDF } from 'jspdf'
import type { UserOptions } from 'jspdf-autotable'
import { getPageGeom, type PageGeom } from './layout.ts'
import { DS_RGB, DS_SPACE, DS_TYPE } from './tokens.ts'

export type KpiTone = 'neutral' | 'up' | 'down' | 'muted'

export type KpiCardInput = {
  label: string
  value: string
  /** Delta opcional, p.ej. "▲ 12,4%" — un solo mensaje extra */
  delta?: string
  tone?: KpiTone
  x: number
  y: number
  w: number
  h?: number
}

const KPI_H = 72

function deltaColor(tone: KpiTone): [number, number, number] {
  if (tone === 'up') return DS_RGB.alertSuccess
  if (tone === 'down') return DS_RGB.alertError
  if (tone === 'muted') return DS_RGB.grayMid
  return DS_RGB.brand
}

/** Tarjeta KPI: un indicador, una lectura. Azul solo en el dato clave. */
export function drawKpiCard(doc: jsPDF, input: KpiCardInput): number {
  const h = input.h ?? KPI_H
  const tone = input.tone ?? 'neutral'

  doc.setFillColor(...DS_RGB.white)
  doc.setDrawColor(...DS_RGB.grayLight)
  doc.setLineWidth(0.75)
  doc.roundedRect(input.x, input.y, input.w, h, 4, 4, 'FD')

  doc.setFont(DS_TYPE.fontFamily, 'normal')
  doc.setFontSize(DS_TYPE.caption)
  doc.setTextColor(...DS_RGB.grayMid)
  doc.text(input.label.toUpperCase(), input.x + DS_SPACE.sm, input.y + 18)

  doc.setFont(DS_TYPE.fontFamily, 'bold')
  doc.setFontSize(DS_TYPE.section)
  doc.setTextColor(...DS_RGB.grayDark)
  doc.text(input.value, input.x + DS_SPACE.sm, input.y + 42)

  if (input.delta) {
    doc.setFont(DS_TYPE.fontFamily, 'bold')
    doc.setFontSize(DS_TYPE.caption)
    doc.setTextColor(...deltaColor(tone))
    doc.text(input.delta, input.x + DS_SPACE.sm, input.y + 58)
  }

  return input.y + h
}

/** Fila de N KPIs con gutter 16 pt. */
export function drawKpiRow(
  doc: jsPDF,
  y: number,
  cards: Array<Omit<KpiCardInput, 'x' | 'y' | 'w'>>,
  geom?: PageGeom,
): number {
  const g = geom ?? getPageGeom(doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight())
  const n = Math.max(1, cards.length)
  const gap = DS_SPACE.md
  const w = (g.contentW - gap * (n - 1)) / n
  let maxBottom = y
  cards.forEach((c, i) => {
    const bottom = drawKpiCard(doc, {
      ...c,
      x: g.contentLeft + i * (w + gap),
      y,
      w,
    })
    maxBottom = Math.max(maxBottom, bottom)
  })
  return maxBottom
}

export type AlertKind = 'info' | 'success' | 'warning' | 'error'
export type AlertSize = 'standard' | 'compact'

const ALERT_STYLES: Record<
  AlertKind,
  { bg: [number, number, number]; fg: [number, number, number]; title: string }
> = {
  info: { bg: DS_RGB.alertInfoBg, fg: DS_RGB.alertInfo, title: 'Información' },
  success: { bg: DS_RGB.alertSuccessBg, fg: DS_RGB.alertSuccess, title: 'Éxito' },
  warning: { bg: DS_RGB.alertWarningBg, fg: DS_RGB.alertWarning, title: 'Advertencia' },
  error: { bg: DS_RGB.alertErrorBg, fg: DS_RGB.alertError, title: 'Error' },
}

/** Alerta editorial: icono/color suave + texto orientado a la acción. */
export function drawAlert(
  doc: jsPDF,
  opts: {
    kind: AlertKind
    message: string
    x: number
    y: number
    w: number
    size?: AlertSize
    title?: string
  },
): number {
  const style = ALERT_STYLES[opts.kind]
  const compact = (opts.size ?? 'standard') === 'compact'
  const pad = compact ? 8 : 12
  const title = opts.title ?? style.title

  doc.setFont(DS_TYPE.fontFamily, 'normal')
  doc.setFontSize(DS_TYPE.body)
  const lines = doc.splitTextToSize(opts.message, opts.w - pad * 2)
  const titleH = compact ? 0 : 14
  const h = pad * 2 + titleH + lines.length * 12

  doc.setFillColor(...style.bg)
  doc.setDrawColor(...style.bg)
  doc.roundedRect(opts.x, opts.y, opts.w, h, 3, 3, 'F')

  // Barra lateral de énfasis (único acento de color)
  doc.setFillColor(...style.fg)
  doc.rect(opts.x, opts.y, 3, h, 'F')

  let ty = opts.y + pad + (compact ? 8 : 10)
  if (!compact) {
    doc.setFont(DS_TYPE.fontFamily, 'bold')
    doc.setFontSize(DS_TYPE.caption)
    doc.setTextColor(...style.fg)
    doc.text(title.toUpperCase(), opts.x + pad + 4, ty)
    ty += 14
  }

  doc.setFont(DS_TYPE.fontFamily, 'normal')
  doc.setFontSize(DS_TYPE.body)
  doc.setTextColor(...DS_RGB.grayDark)
  doc.text(lines, opts.x + pad + 4, ty)

  return opts.y + h
}

/**
 * Estilos autoTable alineados al manual:
 * cabecera azul, zebra sutil, cifras a la derecha, fila totales con regla.
 */
export function dsTableStyles(overrides?: Partial<UserOptions>): UserOptions {
  return {
    theme: 'plain',
    styles: {
      font: DS_TYPE.fontFamily,
      fontSize: DS_TYPE.body,
      textColor: DS_RGB.grayDark,
      cellPadding: { top: 6, bottom: 6, left: 8, right: 8 },
      lineColor: DS_RGB.grayLight,
      lineWidth: 0,
      valign: 'middle',
    },
    headStyles: {
      fillColor: DS_RGB.brand,
      textColor: DS_RGB.white,
      fontStyle: 'bold',
      fontSize: DS_TYPE.caption,
      cellPadding: { top: 7, bottom: 7, left: 8, right: 8 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    footStyles: {
      fillColor: DS_RGB.white,
      textColor: DS_RGB.grayDark,
      fontStyle: 'bold',
      lineWidth: { top: 0.75, right: 0, bottom: 0, left: 0 },
      lineColor: DS_RGB.grayDark,
    },
    ...overrides,
  }
}

/** Portada de sección: un título, un mensaje, sin tablas ni gráficos. */
export function drawSectionCover(
  doc: jsPDF,
  opts: {
    blockLabel: string
    title: string
    subtitle?: string
    geom?: PageGeom
  },
): void {
  const g =
    opts.geom ??
    getPageGeom(doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight())

  const cy = g.pageH / 2 - 40

  doc.setFont(DS_TYPE.fontFamily, 'bold')
  doc.setFontSize(DS_TYPE.caption)
  doc.setTextColor(...DS_RGB.brand)
  doc.text(opts.blockLabel.toUpperCase(), g.contentLeft, cy)

  doc.setFont(DS_TYPE.fontFamily, 'bold')
  doc.setFontSize(DS_TYPE.display)
  doc.setTextColor(...DS_RGB.grayDark)
  doc.text(opts.title, g.contentLeft, cy + 36)

  if (opts.subtitle) {
    doc.setFont(DS_TYPE.fontFamily, 'normal')
    doc.setFontSize(DS_TYPE.subtitle)
    doc.setTextColor(...DS_RGB.grayMid)
    const lines = doc.splitTextToSize(opts.subtitle, g.textMaxW)
    doc.text(lines, g.contentLeft, cy + 64)
  }
}

/** Título de bloque dentro de una página de contenido. */
export function drawBlockTitle(doc: jsPDF, text: string, x: number, y: number): number {
  doc.setFont(DS_TYPE.fontFamily, 'bold')
  doc.setFontSize(DS_TYPE.section)
  doc.setTextColor(...DS_RGB.grayDark)
  doc.text(text, x, y)
  return y + DS_SPACE.lg
}

/** Subtítulo de bloque. */
export function drawBlockSubtitle(doc: jsPDF, text: string, x: number, y: number): number {
  doc.setFont(DS_TYPE.fontFamily, 'normal')
  doc.setFontSize(DS_TYPE.subtitle)
  doc.setTextColor(...DS_RGB.grayMid)
  doc.text(text, x, y)
  return y + DS_SPACE.md
}
