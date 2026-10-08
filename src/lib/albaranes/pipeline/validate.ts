import type { CanonicalDocument } from '../extractors/canonical.ts'

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
      && discount < 100 && near(quantity * unitPrice * (1 - discount / 100), lineTotal)
    const fixedDiscountMatchesNetPrice = quantity != null && quantity > 0
      && unitPrice != null && unitPrice > 0 && netUnitPrice != null && netUnitPrice > 0
      && lineTotal != null && declaresDiscount
      && near(unitPrice - discount, netUnitPrice)
      && near(quantity * netUnitPrice, lineTotal)

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
    const match = candidates.find(({ factor }) => near(quantity * factor * effectiveUnitPrice, lineTotal))
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
  const reasons: string[] = []
  if (lines.length === 0) reasons.push('sin_lineas')
  const complete = lines.every((line) => line.lineTotal != null)
  const lineSum = complete ? lines.reduce((sum, line) => sum + line.lineTotal!, 0) : null
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
