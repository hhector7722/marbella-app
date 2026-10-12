import { compareExact, parseExactDecimal } from './exact-decimal.ts'

type ReceiptLineIdentity = {
  interpretation_proposal_id: unknown
  mapped_ingredient_id: unknown
  original_name: unknown
  quantity: unknown
  line_unit: unknown
  unit_price: unknown
  total_price: unknown
}

type ReviewedProposalIdentity = {
  id: unknown
  mapping_version_id: unknown
  ingredient_id: unknown
  source_item_name: unknown
  line_quantity: unknown
  line_unit: unknown
  observed_unit_price: unknown
  line_total: unknown
}

function trimmed(value: unknown): string | null {
  return value == null ? null : String(value).trim()
}

function differentText(left: unknown, right: unknown): boolean {
  return trimmed(left)?.toLowerCase() !== trimmed(right)?.toLowerCase()
}

function differentNumber(left: unknown, right: unknown): boolean {
  const leftRaw = trimmed(left)
  const rightRaw = trimmed(right)
  if (leftRaw == null || rightRaw == null) return leftRaw !== rightRaw
  const a = parseExactDecimal(leftRaw)
  const b = parseExactDecimal(rightRaw)
  return !a || !b || compareExact(a, b) !== 0
}

/** Explica una discrepancia de K4 sin relajar su comprobación económica. */
export function explainReceiptProposalMismatch(
  line: ReceiptLineIdentity | null,
  proposal: ReviewedProposalIdentity | null,
  mappingVersionId: string
): string {
  if (!line || !proposal || trimmed(line.interpretation_proposal_id) !== trimmed(proposal.id)) {
    return 'Hay una revisión más reciente de esta línea. Cierra y vuelve a abrir el albarán.'
  }
  if (trimmed(proposal.mapping_version_id) !== mappingVersionId) {
    return 'La presentación seleccionada cambió. Cierra y vuelve a abrir el albarán para revisar la versión actual.'
  }
  if (trimmed(line.mapped_ingredient_id) !== trimmed(proposal.ingredient_id)) {
    return 'El ingrediente vinculado cambió. Vuelve a seleccionarlo en «Revisar compra» y guarda.'
  }
  if (differentText(line.original_name, proposal.source_item_name)) {
    return 'El nombre del producto cambió. Revísalo en «Corregir lectura» y vuelve a «Revisar compra».'
  }
  if (differentNumber(line.quantity, proposal.line_quantity)) {
    return 'La cantidad cambió. Revísala en «Corregir lectura» y vuelve a «Revisar compra».'
  }
  if (differentText(line.line_unit, proposal.line_unit)) {
    return 'La unidad facturada no coincide con la revisión. Corrige «Unidad facturada» en «Revisar compra» y guarda de nuevo.'
  }
  if (differentNumber(line.unit_price, proposal.observed_unit_price)
    || (proposal.line_total != null && differentNumber(line.total_price, proposal.line_total))) {
    return 'El precio o importe cambió. Revísalo en «Corregir lectura» y vuelve a «Revisar compra».'
  }
  return 'La línea cambió mientras la revisabas. Cierra y vuelve a abrir el albarán para usar la revisión actual.'
}
