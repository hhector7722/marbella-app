import type { CanonicalDocument } from '../extractors/canonical.ts'
import { isAdministrativeNonProductRow } from './non-product-line.ts'
import {
  compareExact, divideExact, isPositiveExact, multiplyExact, parseExactDecimal,
  roundExactToScale, subtractExact, withinExactTolerance, ratio,
} from '../k5/exact-decimal.ts'

export type LineCheck = {
  quantity: number | null
  unitPrice: number | null
  lineTotal: number | null
  netUnitPrice: number | null
  discountPercent: number | null
  packageContent: number | null
  priceBasis: 'billing_quantity' | 'package_content' | 'units_per_package' | null
  reasons: string[]
}

export function parseObservedDecimal(raw: string | null): number | null {
  if (!raw) return null
  const input = raw.trim().replace(/[€\s]/g, '')
  if (!/^-?\d[\d.,]*\d$|^-?\d$/.test(input)) return null
  const lastComma = input.lastIndexOf(',')
  const lastDot = input.lastIndexOf('.')
  let normalized = input
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? input.replaceAll('.', '').replace(',', '.')
      : input.replaceAll(',', '')
  } else if (lastComma >= 0) normalized = input.replace(',', '.')
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function near(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.03
}

/**
 * Un precio impreso con dos decimales puede proceder de uno más preciso.
 * Solo admite el importe si el precio efectivo vuelve a redondear al impreso,
 * la discrepancia respeta la precisión impresa y el valor a 4 decimales concilia
 * con K4. No modifica nunca el dato OCR original.
 */
export function reconcileRoundedDisplayedUnitPrice(
  quantityRaw: string | null,
  printedUnitPriceRaw: string | null,
  lineTotalRaw: string | null
): string | null {
  if (!printedUnitPriceRaw || !/^\s*\d+[.,]\d{2}\s*$/.test(printedUnitPriceRaw)) return null
  const quantity = parseExactDecimal(quantityRaw)
  const price = parseExactDecimal(printedUnitPriceRaw)
  const total = parseExactDecimal(lineTotalRaw)
  if (!isPositiveExact(quantity) || !isPositiveExact(price) || !isPositiveExact(total)) return null

  const printedTotal = multiplyExact(quantity, price)
  // El umbral es la mitad de un céntimo POR UNIDAD, no un importe fijo
  // de cinco céntimos que bloquearía compras de muchas unidades.
  if (compareExact(printedTotal, total) === 0) return null
  const roundingMargin = divideExact(quantity, ratio(BigInt(200)))!
  if (!withinExactTolerance(printedTotal, total, roundingMargin)) return null

  const effective = divideExact(total, quantity)
  if (!isPositiveExact(effective)
    || compareExact(parseExactDecimal(roundExactToScale(effective, 2))!, price) !== 0) return null

  // K4 guarda el precio observado a cuatro decimales.
  const normalized = roundExactToScale(effective, 4)
  if (!withinExactTolerance(
    multiplyExact(quantity, parseExactDecimal(normalized)!),
    total,
    parseExactDecimal('0.03')!
  )) return null
  return normalized
}

/**
 * Descuento fijo por unidad facturada (DTO. en euros), como en SHERS.
 * Verifica el descuento fijo y admite 1 céntimo de desviación por redondeo\n * entre bruto, descuento y neto impresos; el precio real procede
 * del importe de la línea y solo puede diferir por redondeo del neto a céntimos.
 * No acepta descuentos sin precio neto explícito ni cargos adicionales.
 */
export function reconcileFixedDiscountedUnitPrice(line: {
  quantity_raw: string | null
  unit_price_raw: string | null
  discount_raw: string | null
  discount_header_raw: string | null
  net_unit_price_raw: string | null
  line_total_raw: string | null
  other_charge_raw?: string | null
}): string | null {
  if (!/dto|discount|descuento/i.test(line.discount_header_raw ?? '')
    || /%|por\s*ciento|percent/i.test(line.discount_header_raw ?? '')
    || line.other_charge_raw?.trim()) return null
  const quantity = parseExactDecimal(line.quantity_raw)
  const gross = parseExactDecimal(line.unit_price_raw)
  const discount = parseExactDecimal(line.discount_raw)
  const printedNet = parseExactDecimal(line.net_unit_price_raw)
  const total = parseExactDecimal(line.line_total_raw)
  if (!isPositiveExact(quantity) || !isPositiveExact(gross)
    || !isPositiveExact(discount) || !isPositiveExact(printedNet)
    || !isPositiveExact(total) || compareExact(discount, gross) >= 0) return null

  const effective = divideExact(total, quantity)
  if (!isPositiveExact(effective)) return null

  const discountedGross = subtractExact(gross, discount)
  if (compareExact(discountedGross, printedNet) !== 0) {
    // Las tres cifras del proveedor se imprimen en céntimos. El precio real
    // puede estar a mitad de céntimo: p.ej. 8,22 - 3,24 = 4,98, pero
    // 9,97 / 2 = 4,985, impreso como 4,99. Solo aceptamos hasta 1 céntimo
    // de desfase y comprobamos ambas cifras contra el importe original.
    const printedCents = /^\s*\d+[.,]\d{2}\s*$/
    if (!printedCents.test(line.unit_price_raw ?? '')
      || !printedCents.test(line.discount_raw ?? '')
      || !printedCents.test(line.net_unit_price_raw ?? '')
      || !withinExactTolerance(discountedGross, printedNet, parseExactDecimal('0.01')!)
      || !withinExactTolerance(discountedGross, effective, parseExactDecimal('0.01')!)) return null
  }

  if (compareExact(parseExactDecimal(roundExactToScale(effective, 2))!, printedNet) !== 0
    || !withinExactTolerance(
      multiplyExact(quantity, printedNet), total,
      divideExact(quantity, ratio(BigInt(200)))!
    )) return null

  // K4 aplica precios de cuatro decimales; nunca cambia el total observado.
  const result = roundExactToScale(effective, 4)
  return withinExactTolerance(
    multiplyExact(quantity, parseExactDecimal(result)!),
    total, parseExactDecimal('0.03')!
  ) ? result : null
}

/**
 * Descuento porcentual: comprueba a escala de céntimos por unidad
 * sin depender del volumen del pedido. La factura conserva el total
 * y el precio de K4 se calcula a cuatro decimales.
 */
export function reconcilePercentageDiscountedUnitPrice(line: {
  quantity_raw: string | null
  unit_price_raw: string | null
  discount_raw: string | null
  net_unit_price_raw?: string | null
  line_total_raw: string | null
  other_charge_raw?: string | null
}): string | null {
  if (line.other_charge_raw?.trim()) return null
  const quantity = parseExactDecimal(line.quantity_raw)
  const gross = parseExactDecimal(line.unit_price_raw)
  const discount = parseExactDecimal(line.discount_raw)
  const total = parseExactDecimal(line.line_total_raw)
  if (!isPositiveExact(quantity) || !isPositiveExact(gross)
    || !isPositiveExact(discount) || !isPositiveExact(total)
    || compareExact(discount, ratio(BigInt(100))) >= 0) return null
  const multiplier = divideExact(subtractExact(ratio(BigInt(100)), discount), ratio(BigInt(100)))!
  const calculated = multiplyExact(gross, multiplier)
  const actual = divideExact(total, quantity)!
  const maxDeviation = parseExactDecimal('0.005')!
  if (!isPositiveExact(actual)
    || !withinExactTolerance(actual, calculated, maxDeviation)) return null
  const net = parseExactDecimal(line.net_unit_price_raw)
  if (net && compareExact(parseExactDecimal(roundExactToScale(actual, 2))!, net) !== 0) return null
  const normalized = roundExactToScale(actual, 4)
  return withinExactTolerance(
    multiplyExact(quantity, parseExactDecimal(normalized)!), total,
    parseExactDecimal('0.03')!
  ) ? normalized : null
}

function embeddedKgPerPackage(line: CanonicalDocument['lines'][number], quantity: number | null): number | null {
  // Con más de un bulto, el peso impreso puede ser total o por bulto.
  if (quantity !== 1 || line.content_per_unit_raw) return null
  const match = /^(?:BU|BULTOS?|CJ|CAJAS?)\s+(\d+(?:[.,]\d+)?)\s*(?:KG|KILOS?|QUILOS?)$/i
    .exec((line.billing_unit_raw ?? '').trim())
  const content = match ? parseObservedDecimal(match[1]) : null
  return content != null && content > 0 ? content : null
}

function verifiedAmountColumn(line: CanonicalDocument['lines'][number], quantity: number | null,
  unitPrice: number | null): number | null {
  if ((line.other_charge_header_raw ?? '').trim().toLocaleLowerCase('es') !== 'importe'
    || quantity == null || quantity <= 0 || unitPrice == null || unitPrice <= 0) return null
  const amount = parseObservedDecimal(line.other_charge_raw)
  const printedPriceWithTax = parseObservedDecimal(line.line_total_raw)
  const taxRate = parseObservedDecimal(line.tax_rate_raw)
  if (amount == null || printedPriceWithTax == null || taxRate == null
    || taxRate < 0 || taxRate > 25) return null
  const expectedTaxPrice = Math.round((unitPrice * (1 + taxRate / 100) + Number.EPSILON) * 100) / 100
  if (!near(quantity * unitPrice, amount) || Math.abs(expectedTaxPrice - printedPriceWithTax) > 0.01) return null
  return amount
}

export function validateObservedLine(line: CanonicalDocument['lines'][number]): LineCheck {
  const quantity = parseObservedDecimal(line.quantity_raw)
  const unitPrice = parseObservedDecimal(line.unit_price_raw)
  const verifiedAmount = verifiedAmountColumn(line, quantity, unitPrice)
  const lineTotal = verifiedAmount ?? parseObservedDecimal(line.line_total_raw)
  const netUnitPrice = parseObservedDecimal(line.net_unit_price_raw)
  const discount = parseObservedDecimal(line.discount_raw)
  const packageContent = parseObservedDecimal(line.content_per_unit_raw)
    ?? embeddedKgPerPackage(line, quantity)
  const unitsPerPackage = parseObservedDecimal(line.units_per_package_raw)
  const reasons: string[] = []

  if (quantity == null || quantity <= 0) reasons.push('cantidad_ausente_o_invalida')
  if (unitPrice == null || unitPrice <= 0) reasons.push('precio_ausente_o_invalido')
  if (lineTotal == null || lineTotal < 0) reasons.push('importe_ausente_o_invalido')

  let discountPercent: number | null = null
  let fixedDiscountPerUnit: number | null = null
  if (discount != null && discount > 0 && !(verifiedAmount != null
    && (line.discount_header_raw ?? '').trim().toLocaleLowerCase('es') === 'ibee')) {
    const header = (line.discount_header_raw ?? '').toLowerCase()
    const declaresPercent = /%|por\s*ciento|percent/.test(header)
    const declaresDiscount = /dto|discount|descuento/.test(header)
    const percentMatchesAmount = quantity != null && quantity > 0
      && unitPrice != null && unitPrice > 0 && lineTotal != null
      && discount < 100 && reconcilePercentageDiscountedUnitPrice(line) != null
    const verifiedFixedDiscountPrice = declaresDiscount
      ? reconcileFixedDiscountedUnitPrice(line) : null
    const fixedDiscountMatchesNetPrice = verifiedFixedDiscountPrice != null

    if (declaresPercent && discount < 100) discountPercent = discount
    // Algunos proveedores no preservan la cabecera "% DTO" en la lectura.
    // Solo aceptamos el porcentaje si la ecuación impresa lo demuestra.
    else if (!header.trim() && percentMatchesAmount) discountPercent = discount
    // Un DTO en euros solo es verificable cuando el documento también declara
    // el precio neto unitario y ambas igualdades coinciden.
    else if (fixedDiscountMatchesNetPrice) fixedDiscountPerUnit = discount
    else reasons.push('descuento_sin_porcentaje_verificado')
  }

  let priceBasis: LineCheck['priceBasis'] = null
  if (quantity != null && quantity > 0 && unitPrice != null && unitPrice > 0 && lineTotal != null) {
    const multiplier = discountPercent == null ? 1 : 1 - discountPercent / 100
    const effectiveUnitPrice = fixedDiscountPerUnit == null
      ? unitPrice * multiplier
      : netUnitPrice!
    const candidates: Array<{ basis: NonNullable<LineCheck['priceBasis']>; factor: number }> = [
      { basis: 'billing_quantity', factor: 1 },
    ]
    if (packageContent != null && packageContent > 0) {
      candidates.push({ basis: 'package_content', factor: packageContent })
    }
    if (unitsPerPackage != null && unitsPerPackage > 0) {
      candidates.push({ basis: 'units_per_package', factor: unitsPerPackage })
    }
    const verifiedFixedDiscountPrice = fixedDiscountPerUnit != null
      ? reconcileFixedDiscountedUnitPrice(line) : null
    const verifiedPercentDiscountPrice = discountPercent != null
      ? reconcilePercentageDiscountedUnitPrice(line) : null
    const roundedBillingPrice = (discount == null || discount === 0)
      && netUnitPrice == null && !line.other_charge_raw
      ? reconcileRoundedDisplayedUnitPrice(line.quantity_raw, line.unit_price_raw, line.line_total_raw)
      : null
    const match = candidates.find(({ basis, factor }) =>
      near(quantity * factor * effectiveUnitPrice, lineTotal)
      || (basis === 'billing_quantity'
        && (roundedBillingPrice != null || verifiedFixedDiscountPrice != null
          || verifiedPercentDiscountPrice != null)))
    if (match) priceBasis = match.basis
    else reasons.push('cantidad_precio_importe_no_reconcilian')
    if (netUnitPrice != null) {
      const expectedNet = fixedDiscountPerUnit == null
        ? unitPrice * multiplier
        : unitPrice - fixedDiscountPerUnit
      if (netUnitPrice <= 0 || !near(netUnitPrice, expectedNet)) reasons.push('precio_neto_contradictorio')
    }
  }
  if (line.other_charge_raw && !line.other_charge_header_raw) reasons.push('cargo_adicional_sin_concepto')

  return { quantity, unitPrice, lineTotal, netUnitPrice, discountPercent, packageContent, priceBasis, reasons }
}

export function validateObservedDocument(document: CanonicalDocument): {
  lines: LineCheck[]
  reasons: string[]
  lineSum: number | null
} {
  const lines = document.lines.map(validateObservedLine)
  const economicLines = lines.filter((_, index) => {
    const source = document.lines[index]!
    return !isAdministrativeNonProductRow({
      name: source.description_raw,
      supplierProductCode: source.supplier_product_code_raw,
      quantity: source.quantity_raw, unitPrice: source.unit_price_raw,
      total: source.line_total_raw, netUnitPrice: source.net_unit_price_raw,
      discount: source.discount_raw,
    })
  })
  const reasons: string[] = []
  if (economicLines.length === 0) reasons.push('sin_lineas')
  const complete = economicLines.every((line) => line.lineTotal != null)
  const lineSum = economicLines.length > 0 && complete
    ? economicLines.reduce((sum, line) => sum + line.lineTotal!, 0) : null
  const subtotal = parseObservedDecimal(document.subtotal_raw)
  const tax = parseObservedDecimal(document.tax_raw)
  const total = parseObservedDecimal(document.total_raw)
  // Algunos albaranes imprimen varias bases de IVA y el OCR devuelve una
  // sola en subtotal_raw. Si todas las líneas leídas más el IVA cuadran con
  // el total, la conciliación documental está demostrada sin esa base parcial.
  const linesAndTaxMatchTotal = lineSum != null && subtotal != null && subtotal > 0
    && subtotal < lineSum && tax != null && total != null
    && near(lineSum + tax, total)
  if (subtotal == null && total == null) reasons.push('total_documento_no_verificable')
  if (subtotal != null && tax != null && total != null && !linesAndTaxMatchTotal
    && !near(subtotal + tax, total)) {
    reasons.push('subtotal_iva_total_no_reconcilian')
  }
  if (lineSum != null && subtotal != null && !linesAndTaxMatchTotal
    && !near(lineSum, subtotal)) {
    reasons.push('lineas_subtotal_no_reconcilian')
  }
  if (lineSum != null && subtotal == null && tax == null && total != null && !near(lineSum, total)) {
    reasons.push('lineas_total_no_reconcilian')
  }
  return { lines, reasons, lineSum }
}
