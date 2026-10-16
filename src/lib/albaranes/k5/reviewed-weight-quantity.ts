import { compareExact, multiplyExact, parseExactDecimal, withinExactTolerance } from './exact-decimal.ts'
import { reconcileRoundedDisplayedUnitPrice } from '../pipeline/validate.ts'

/** A manager corrected a misread weight or item count against the original document.
 * Keep the OCR observation untouched and accept only arithmetic supported by
 * the original printed unit price and line amount. K4 still validates the
 * resulting versioned proposal before any economic effect. */
export function verifiedReviewedWeightQuantity(input: {
  reviewed: boolean
  sourceQuantityRaw: string | null
  correctedQuantity: string
  sourceUnitPriceRaw: string | null
  effectiveUnitPrice: string
  sourceLineTotalRaw: string | null
  correctedLineTotal: string
  hasAdjustments: boolean
  lineBillingUnit: string
  lineContentUnit: string
  lineContentQty: number
  conversionFactor: number
}): boolean {
  const billingUnit = input.lineBillingUnit.trim().toLowerCase()
  const contentUnit = input.lineContentUnit.trim().toLowerCase()
  const compatibleSimpleUnit = (billingUnit === 'kg' && contentUnit === 'kg')
    || (['uni', 'ud', 'unidad'].includes(billingUnit) && contentUnit === 'ud')
  if (!input.reviewed || input.hasAdjustments
    || !compatibleSimpleUnit
    || input.lineContentQty !== 1 || input.conversionFactor !== 1) return false

  const sourceQuantity = parseExactDecimal(input.sourceQuantityRaw)
  const correctedQuantity = parseExactDecimal(input.correctedQuantity)
  const printedPrice = parseExactDecimal(input.sourceUnitPriceRaw)
  const effectivePrice = parseExactDecimal(input.effectiveUnitPrice)
  const sourceTotal = parseExactDecimal(input.sourceLineTotalRaw)
  const correctedTotal = parseExactDecimal(input.correctedLineTotal)
  const zero = parseExactDecimal('0')!
  if (!sourceQuantity || !correctedQuantity || !printedPrice || !effectivePrice
    || !sourceTotal || !correctedTotal
    || compareExact(sourceQuantity, correctedQuantity) === 0
    || compareExact(correctedQuantity, zero) <= 0
    || compareExact(printedPrice, zero) <= 0
    || compareExact(sourceTotal, zero) <= 0
    || compareExact(sourceTotal, correctedTotal) !== 0) return false

  const roundedPrice = reconcileRoundedDisplayedUnitPrice(
    input.correctedQuantity,
    input.sourceUnitPriceRaw,
    input.sourceLineTotalRaw
  )
  if (roundedPrice) {
    const expected = parseExactDecimal(roundedPrice)
    return Boolean(expected && compareExact(expected, effectivePrice) === 0)
  }
  return compareExact(printedPrice, effectivePrice) === 0
    && withinExactTolerance(
      multiplyExact(correctedQuantity, printedPrice),
      sourceTotal,
      parseExactDecimal('0.005')!
    )
}
