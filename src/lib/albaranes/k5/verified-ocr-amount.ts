import { compareExact, multiplyExact, parseExactDecimal, withinExactTolerance } from './exact-decimal.ts'

type ObservedAmount = {
  quantity_raw?: string | null
  unit_price_raw?: string | null
  line_total_raw?: string | null
  discount_raw?: string | null
  net_unit_price_raw?: string | null
  other_charge_raw?: string | null
}

/** A manager's explicit review can correct a single OCR amount, while retaining
 * the original OCR cells on the preceding proposal for audit. */
export function verifiedCorrectedOcrAmount(input: {
  attested: boolean
  priorReasons: string[]
  priorManualCorrection: boolean
  observed: ObservedAmount
  quantity: string
  unitPrice: string
  correctedTotal: string
}): boolean {
  if (!input.attested || !input.priorManualCorrection
    || !input.priorReasons.includes('cantidad_precio_importe_no_reconcilian')) return false
  const observed = input.observed
  if (observed.discount_raw || observed.net_unit_price_raw || observed.other_charge_raw) return false
  const sourceQuantity = parseExactDecimal(observed.quantity_raw)
  const sourcePrice = parseExactDecimal(observed.unit_price_raw)
  const sourceTotal = parseExactDecimal(observed.line_total_raw)
  const quantity = parseExactDecimal(input.quantity)
  const price = parseExactDecimal(input.unitPrice)
  const correctedTotal = parseExactDecimal(input.correctedTotal)
  if (!sourceQuantity || !sourcePrice || !sourceTotal || !quantity || !price || !correctedTotal) return false
  if (compareExact(quantity, sourceQuantity) !== 0 || compareExact(price, sourcePrice) !== 0
    || compareExact(sourceTotal, correctedTotal) === 0) return false
  const zero = parseExactDecimal('0')!
  if (compareExact(quantity, zero) <= 0 || compareExact(price, zero) <= 0
    || compareExact(correctedTotal, zero) <= 0) return false
  return withinExactTolerance(multiplyExact(quantity, price), correctedTotal, parseExactDecimal('0.005')!)
}
