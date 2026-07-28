/**
 * Marbella PDF Design System v2.0
 *
 * Kit para generar PDF NUEVOS con la identidad editorial del manual.
 * Los generadores existentes (pedidos, fichajes, encargos, etc.) NO deben
 * importar este módulo ni migrarse sin decisión explícita.
 *
 * Referencia: docs/design-system/Marbella-PDF-Design-System-v2.0.pdf
 */

export {
  DS_V2_VERSION,
  DS_COLORS,
  DS_RGB,
  DS_TYPE,
  DS_SPACE,
  DS_PAGE,
  DS_COMPANY,
  hexToRgb,
} from './tokens.ts'

export {
  getPageGeom,
  columnX,
  columnSpanWidth,
  snap8,
  type PageGeom,
} from './layout.ts'

export {
  drawHeader,
  drawFooter,
  applyChromeToAllPages,
  type ChromeOptions,
} from './chrome.ts'

export {
  drawKpiCard,
  drawKpiRow,
  drawAlert,
  dsTableStyles,
  drawSectionCover,
  drawBlockTitle,
  drawBlockSubtitle,
  type KpiCardInput,
  type KpiTone,
  type AlertKind,
  type AlertSize,
} from './components.ts'

export {
  createDsDocument,
  formatEuro,
  formatNumber,
  type CreateDsDocumentOptions,
  type DsDocument,
} from './create-document.ts'
