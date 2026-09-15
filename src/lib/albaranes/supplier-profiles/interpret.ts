import type {
  EvidenceRow,
  EvidenceValue,
  FieldName,
  InterpretedLine,
  QuantityUnit,
  ReviewReason,
  SupplierEvidenceFixture,
  SupplierProfile,
  SupplierProfileInterpretation,
} from './types.ts'

const unitAliases: Record<string, QuantityUnit> = {
  un: 'unit',
  uni: 'unit',
  unidad: 'unit',
  unidades: 'unit',
  ud: 'unit',
  uds: 'unit',
  u: 'unit',
  pz: 'piece',
  pieza: 'piece',
  piezas: 'piece',
  bu: 'bundle',
  bulto: 'bundle',
  bultos: 'bundle',
  kg: 'kg',
  k: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  l: 'l',
  lt: 'l',
  litro: 'l',
  litros: 'l',
  cj: 'case',
  caja: 'case',
  cajas: 'case',
  bolsa: 'bag',
  bolsas: 'bag',
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9%]+/g, ' ')
    .trim()
}

function toNumber(value: EvidenceValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const match = value.trim().replace(/\./g, '').replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

function valueFor(profile: SupplierProfile, row: EvidenceRow, field: FieldName): EvidenceValue {
  const definition = profile.fields[field]
  if (!definition) return null
  const aliases = new Set(definition.aliases.map(normalize))
  const key = Object.keys(row).find((candidate) => aliases.has(normalize(candidate)))
  return key === undefined ? null : row[key] ?? null
}

function observed(profile: SupplierProfile, row: EvidenceRow): Record<string, EvidenceValue> {
  const values: Record<string, EvidenceValue> = {}
  for (const key of Object.keys(profile.fields) as FieldName[]) values[key] = valueFor(profile, row, key)
  return values
}

function parseQuantity(value: EvidenceValue, defaultUnit?: QuantityUnit): {
  quantity: number | null
  unit: QuantityUnit | null
} {
  const quantity = toNumber(value)
  if (typeof value !== 'string') return { quantity, unit: defaultUnit ?? null }
  const suffix = value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .match(/[a-z]+/g)
    ?.at(-1)
  return { quantity, unit: suffix ? unitAliases[suffix] ?? null : defaultUnit ?? null }
}

function parseDescriptionPackaging(product: string): {
  unitsPerCase: number | null
  content: InterpretedLine['physical']['content_per_unit']
} {
  const units =
    product.match(/(?:^|\s)(\d{1,4})\s*(?:UDS?|UN|U)(?:\b|\s)/i) ??
    product.match(/(?:^|\s)(\d{1,4})\s+(?=\d+(?:[.,]\d+)?\s*(?:ML|CL|L|G|KG)\b)/i)
  const content = product.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(ML|CL|L|G|KG)\b/i)
  return {
    unitsPerCase: units ? Number(units[1]) : null,
    content: content
      ? {
          value: Number(content[1]!.replace(',', '.')),
          unit: content[2]!.toLowerCase() as 'ml' | 'cl' | 'l' | 'g' | 'kg',
        }
      : null,
  }
}

function parsePresentation(product: string): { count: number; content: number; unit: QuantityUnit } | null {
  const match = product.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(L|K|KG)\b/i)
  if (!match) return null
  const unit = /^l$/i.test(match[3]!) ? 'l' : 'kg'
  return { count: Number(match[1]), content: Number(match[2]!.replace(',', '.')), unit }
}

function nearlyEqual(left: number, right: number, tolerance: number): boolean {
  const delta = Math.abs(left - right)
  return delta <= tolerance || Math.round(delta * 100) <= Math.round(tolerance * 100)
}

function issuerRecognized(profile: SupplierProfile, observedIssuer: string): boolean {
  const value = normalize(observedIssuer)
  return [profile.supplier.canonical_name, ...profile.supplier.aliases, ...profile.supplier.observed_document_identities]
    .map(normalize)
    .some((alias) => alias && (value.includes(alias) || alias.includes(value)))
}

function resultStatus(reasons: ReviewReason[], excluded: boolean): InterpretedLine['status'] {
  if (excluded) return 'excluded'
  return reasons.length === 0 ? 'ready_for_review' : 'needs_review'
}

function directLine(profile: SupplierProfile, row: EvidenceRow, index: number, mapping: SupplierEvidenceFixture['item_mapping']): InterpretedLine {
  const values = observed(profile, row)
  const product = typeof values.product === 'string' ? values.product : null
  const sourceQuantity = parseQuantity(values.quantity, profile.interpretation.quantity_unit)
  const price = toNumber(values.unit_price)
  const netPrice = toNumber(values.net_unit_price) ?? price
  const amount = toNumber(values.line_amount)
  const tax = toNumber(values.tax_percent) ?? profile.interpretation.tax_percent ?? null
  const reasons: ReviewReason[] = []

  if (!product) reasons.push('missing_product')
  if (sourceQuantity.quantity === null) reasons.push('missing_quantity')
  if (sourceQuantity.quantity !== null && sourceQuantity.unit === null) reasons.push('unknown_quantity_unit')
  if (
    sourceQuantity.unit !== null &&
    profile.interpretation.accepted_quantity_units &&
    !profile.interpretation.accepted_quantity_units.includes(sourceQuantity.unit)
  ) {
    reasons.push('unknown_quantity_unit')
  }
  if (netPrice === null) reasons.push('missing_unit_price')
  if (amount === null) reasons.push('missing_line_amount')
  if (mapping === 'missing') reasons.push('mapping_missing')

  if (profile.interpretation.presentation_from_description) {
    const presentation = product ? parsePresentation(product) : null
    if (!presentation) {
      reasons.push('unsupported_presentation')
    } else if (
      sourceQuantity.quantity !== null &&
      sourceQuantity.unit === presentation.unit &&
      !nearlyEqual(sourceQuantity.quantity, presentation.count * presentation.content, profile.interpretation.rounding_tolerance ?? 0.01)
    ) {
      reasons.push('unsupported_presentation')
    }
  }

  if (
    sourceQuantity.quantity !== null &&
    netPrice !== null &&
    amount !== null &&
    !nearlyEqual(sourceQuantity.quantity * netPrice, amount, profile.interpretation.rounding_tolerance ?? 0.01)
  ) {
    reasons.push('line_amount_mismatch')
  }

  return {
    source_row_index: index,
    product,
    observed: values,
    physical: {
      quantity: sourceQuantity.quantity,
      unit: sourceQuantity.unit,
      cases: toNumber(values.cases),
      units_per_case: null,
      content_per_unit: null,
    },
    economics: {
      unit_price_before_discount: price,
      discount_percent: toNumber(values.discount_percent),
      net_unit_price: netPrice,
      line_amount_without_tax: profile.interpretation.amount_tax_basis === 'with_tax' ? null : amount,
      line_amount_with_tax: profile.interpretation.amount_tax_basis === 'with_tax' ? amount : null,
      tax_percent: tax,
    },
    proposal: {
      physical_quantity: sourceQuantity.quantity,
      physical_unit: sourceQuantity.unit,
      normalized_unit_price: netPrice,
      normalized_price_unit: profile.interpretation.price_unit ?? null,
      eligible_for_stock_and_recipes: true,
    },
    status: resultStatus(reasons, false),
    needs_review: reasons,
    exclusion_reason: null,
  }
}

function caseDiscount(profile: SupplierProfile, row: EvidenceRow, index: number, mapping: SupplierEvidenceFixture['item_mapping']): InterpretedLine {
  const values = observed(profile, row)
  const product = typeof values.product === 'string' ? values.product : null
  const sourceCases = parseQuantity(values.quantity, 'case').quantity
  const price = toNumber(values.unit_price)
  const discount = toNumber(values.discount_percent)
  const amount = toNumber(values.line_amount)
  const packaging = product ? parseDescriptionPackaging(product) : { unitsPerCase: null, content: null }
  const reasons: ReviewReason[] = []
  if (!product) reasons.push('missing_product')
  if (sourceCases === null) reasons.push('missing_quantity')
  if (price === null) reasons.push('missing_unit_price')
  if (discount === null) reasons.push('discount_not_interpretable')
  if (amount === null) reasons.push('missing_line_amount')
  if (profile.interpretation.units_per_case_from_description && packaging.unitsPerCase === null) reasons.push('unsupported_presentation')
  if (mapping === 'missing') reasons.push('mapping_missing')
  if (sourceCases !== null && price !== null && discount !== null && amount !== null) {
    const expected = sourceCases * price * (1 - discount / 100)
    if (!nearlyEqual(expected, amount, profile.interpretation.rounding_tolerance ?? 0.01)) reasons.push('line_amount_mismatch')
  }
  const physicalQuantity = sourceCases !== null && packaging.unitsPerCase !== null ? sourceCases * packaging.unitsPerCase : null
  return {
    source_row_index: index,
    product,
    observed: values,
    physical: {
      quantity: physicalQuantity,
      unit: 'unit',
      cases: sourceCases,
      units_per_case: packaging.unitsPerCase,
      content_per_unit: packaging.content,
    },
    economics: {
      unit_price_before_discount: price,
      discount_percent: discount,
      net_unit_price: sourceCases && amount !== null ? amount / sourceCases : null,
      line_amount_without_tax: amount,
      line_amount_with_tax: null,
      tax_percent: null,
    },
    proposal: {
      physical_quantity: physicalQuantity,
      physical_unit: physicalQuantity === null ? null : 'unit',
      normalized_unit_price: physicalQuantity && amount !== null ? amount / physicalQuantity : null,
      normalized_price_unit: physicalQuantity === null ? null : 'EUR/unit',
      eligible_for_stock_and_recipes: true,
    },
    status: resultStatus(reasons, false),
    needs_review: reasons,
    exclusion_reason: null,
  }
}

function discountedUnitLine(profile: SupplierProfile, row: EvidenceRow, index: number, mapping: SupplierEvidenceFixture['item_mapping']): InterpretedLine {
  const values = observed(profile, row)
  const product = typeof values.product === 'string' ? values.product : null
  const sourceQuantity = parseQuantity(values.quantity, profile.interpretation.quantity_unit)
  const price = toNumber(values.unit_price)
  const discount = toNumber(values.discount_percent)
  const amount = toNumber(values.line_amount)
  const reasons: ReviewReason[] = []
  if (!product) reasons.push('missing_product')
  if (sourceQuantity.quantity === null) reasons.push('missing_quantity')
  if (price === null) reasons.push('missing_unit_price')
  if (discount === null) reasons.push('discount_not_interpretable')
  if (amount === null) reasons.push('missing_line_amount')
  if (mapping === 'missing') reasons.push('mapping_missing')
  if (sourceQuantity.quantity !== null && price !== null && discount !== null && amount !== null) {
    const expected = sourceQuantity.quantity * price * (1 - discount / 100)
    if (!nearlyEqual(expected, amount, profile.interpretation.rounding_tolerance ?? 0.01)) reasons.push('line_amount_mismatch')
  }
  const net = price !== null && discount !== null ? price * (1 - discount / 100) : null
  return {
    source_row_index: index,
    product,
    observed: values,
    physical: { quantity: sourceQuantity.quantity, unit: sourceQuantity.unit, cases: toNumber(values.cases), units_per_case: null, content_per_unit: null },
    economics: { unit_price_before_discount: price, discount_percent: discount, net_unit_price: net, line_amount_without_tax: amount, line_amount_with_tax: null, tax_percent: toNumber(values.tax_percent) },
    proposal: { physical_quantity: sourceQuantity.quantity, physical_unit: sourceQuantity.unit, normalized_unit_price: net, normalized_price_unit: net === null ? null : profile.interpretation.price_unit ?? null, eligible_for_stock_and_recipes: true },
    status: resultStatus(reasons, false),
    needs_review: reasons,
    exclusion_reason: null,
  }
}

function vatIncludedPack(profile: SupplierProfile, row: EvidenceRow, index: number, mapping: SupplierEvidenceFixture['item_mapping']): InterpretedLine {
  const values = observed(profile, row)
  const product = typeof values.product === 'string' ? values.product : null
  const bags = parseQuantity(values.quantity, 'bag').quantity
  const totalWithTax = toNumber(values.line_amount_tax_included)
  const taxPercent = profile.interpretation.tax_percent ?? null
  const kilogramsPerBag = product?.match(/(\d+(?:[.,]\d+)?)\s*KG/i)
  const kg = kilogramsPerBag ? Number(kilogramsPerBag[1]!.replace(',', '.')) : null
  const reasons: ReviewReason[] = []
  if (!product) reasons.push('missing_product')
  if (bags === null) reasons.push('missing_quantity')
  if (totalWithTax === null) reasons.push('missing_line_amount')
  if (kg === null) reasons.push('unsupported_presentation')
  if (mapping === 'missing') reasons.push('mapping_missing')
  const totalWithoutTax = totalWithTax !== null && taxPercent !== null ? totalWithTax / (1 + taxPercent / 100) : null
  const physicalKg = bags !== null && kg !== null ? bags * kg : null
  return {
    source_row_index: index,
    product,
    observed: values,
    physical: { quantity: physicalKg, unit: 'kg', cases: null, units_per_case: bags, content_per_unit: kg ? { value: kg, unit: 'kg' } : null },
    economics: { unit_price_before_discount: null, discount_percent: null, net_unit_price: totalWithoutTax !== null && bags ? totalWithoutTax / bags : null, line_amount_without_tax: totalWithoutTax, line_amount_with_tax: totalWithTax, tax_percent: taxPercent },
    proposal: { physical_quantity: physicalKg, physical_unit: physicalKg === null ? null : 'kg', normalized_unit_price: totalWithoutTax !== null && physicalKg ? totalWithoutTax / physicalKg : null, normalized_price_unit: physicalKg === null ? null : 'EUR/kg', eligible_for_stock_and_recipes: true },
    status: resultStatus(reasons, false),
    needs_review: reasons,
    exclusion_reason: null,
  }
}

function volumeContainer(profile: SupplierProfile, row: EvidenceRow, index: number, mapping: SupplierEvidenceFixture['item_mapping']): InterpretedLine {
  const values = observed(profile, row)
  const product = typeof values.product === 'string' ? values.product : null
  const price = toNumber(values.unit_price)
  const amount = toNumber(values.line_amount)
  const containers = toNumber(values.cases)
  const observedLitres = parseQuantity(values.quantity, 'l').quantity
  const description = product ?? ''
  const match = description.match(/(\d+)\s+(?:BOMBONAS?|BOTELLAS?|ENVASES?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*(?:L|LITROS?)\b/i)
  const reasons: ReviewReason[] = []
  if (!product) reasons.push('missing_product')
  if (observedLitres === null) reasons.push('missing_quantity')
  if (!match) reasons.push('unsupported_presentation')
  if (price === null) reasons.push('missing_unit_price')
  if (amount === null) reasons.push('missing_line_amount')
  if (mapping === 'missing') reasons.push('mapping_missing')
  const litres = match ? Number(match[1]) * Number(match[2]!.replace(',', '.')) : null
  if (litres !== null && observedLitres !== null && !nearlyEqual(litres, observedLitres, profile.interpretation.rounding_tolerance ?? 0.01)) {
    reasons.push('unsupported_presentation')
  }
  if (litres !== null && price !== null && amount !== null && !nearlyEqual(litres * price, amount, profile.interpretation.rounding_tolerance ?? 0.01)) reasons.push('line_amount_mismatch')
  return {
    source_row_index: index,
    product,
    observed: values,
    physical: { quantity: litres, unit: 'l', cases: containers, units_per_case: match ? Number(match[1]) : null, content_per_unit: match ? { value: Number(match[2]!.replace(',', '.')), unit: 'l' } : null },
    economics: { unit_price_before_discount: price, discount_percent: null, net_unit_price: price, line_amount_without_tax: amount, line_amount_with_tax: null, tax_percent: toNumber(values.tax_percent) },
    proposal: { physical_quantity: litres, physical_unit: litres === null ? null : 'l', normalized_unit_price: price, normalized_price_unit: price === null ? null : 'EUR/l', eligible_for_stock_and_recipes: true },
    status: resultStatus(reasons, false),
    needs_review: reasons,
    exclusion_reason: null,
  }
}

function internalWater(profile: SupplierProfile, row: EvidenceRow, index: number, mapping: SupplierEvidenceFixture['item_mapping']): InterpretedLine {
  const values = observed(profile, row)
  const product = typeof values.product === 'string' ? values.product : null
  const description = normalize(product ?? '')
  const units = parseQuantity(values.quantity, 'unit').quantity
  const isOneLitre = description.includes('1 LITRO') || description.includes('1L')
  const isHalfLitre = description.includes('0 50') || description.includes('50 CL') || description.includes('0 5')
  const excluded = isOneLitre
  const reasons: ReviewReason[] = []
  if (!product) reasons.push('missing_product')
  if (units === null) reasons.push('missing_quantity')
  if (!isOneLitre && !isHalfLitre) reasons.push('unsupported_presentation')
  if (!excluded && mapping === 'missing') reasons.push('mapping_missing')
  return {
    source_row_index: index,
    product,
    observed: values,
    physical: { quantity: units, unit: 'unit', cases: toNumber(values.cases), units_per_case: null, content_per_unit: isHalfLitre ? { value: 50, unit: 'cl' } : isOneLitre ? { value: 1, unit: 'l' } : null },
    economics: { unit_price_before_discount: null, discount_percent: null, net_unit_price: isHalfLitre ? 0.28 : null, line_amount_without_tax: null, line_amount_with_tax: null, tax_percent: null },
    proposal: { physical_quantity: units, physical_unit: units === null ? null : 'unit', normalized_unit_price: isHalfLitre ? 0.28 : null, normalized_price_unit: isHalfLitre ? 'EUR/bottle' : null, eligible_for_stock_and_recipes: isHalfLitre },
    status: resultStatus(reasons, excluded),
    needs_review: reasons,
    exclusion_reason: excluded ? 'personal_purchase_no_stock_or_recipe' : null,
  }
}

function mixedMeasure(profile: SupplierProfile, row: EvidenceRow, index: number, mapping: SupplierEvidenceFixture['item_mapping']): InterpretedLine {
  const line = directLine(profile, row, index, mapping)
  const reasons = [...line.needs_review]
  if (!reasons.includes('mixed_measurement_requires_review')) reasons.push('mixed_measurement_requires_review')
  return { ...line, proposal: { ...line.proposal, physical_quantity: null, physical_unit: null, normalized_unit_price: null, normalized_price_unit: null }, status: 'needs_review', needs_review: reasons }
}

function netUnitReview(profile: SupplierProfile, row: EvidenceRow, index: number, mapping: SupplierEvidenceFixture['item_mapping']): InterpretedLine {
  const line = directLine(profile, row, index, mapping)
  const values = observed(profile, row)
  const net = toNumber(values.net_unit_price)
  const reasons = [...line.needs_review]
  if (net === null && !reasons.includes('price_not_normalizable')) reasons.push('price_not_normalizable')
  return {
    ...line,
    economics: { ...line.economics, net_unit_price: net },
    proposal: { ...line.proposal, normalized_unit_price: net, normalized_price_unit: net === null ? null : profile.interpretation.price_unit ?? null },
    status: resultStatus(reasons, false),
    needs_review: reasons,
  }
}

export function interpretSupplierEvidence(profile: SupplierProfile, evidence: SupplierEvidenceFixture): SupplierProfileInterpretation {
  const identityRecognized = evidence.supplier_id === profile.supplier.id && issuerRecognized(profile, evidence.observed_issuer)
  const makeLine = (row: EvidenceRow, index: number): InterpretedLine => {
    let line: InterpretedLine
    switch (profile.interpretation.kind) {
      case 'case_discount': line = caseDiscount(profile, row, index, evidence.item_mapping); break
      case 'discounted_unit_line': line = discountedUnitLine(profile, row, index, evidence.item_mapping); break
      case 'vat_included_pack': line = vatIncludedPack(profile, row, index, evidence.item_mapping); break
      case 'volume_container': line = volumeContainer(profile, row, index, evidence.item_mapping); break
      case 'internal_water': line = internalWater(profile, row, index, evidence.item_mapping); break
      case 'mixed_measure_review': line = mixedMeasure(profile, row, index, evidence.item_mapping); break
      case 'net_unit_review': line = netUnitReview(profile, row, index, evidence.item_mapping); break
      case 'direct_line': line = directLine(profile, row, index, evidence.item_mapping); break
    }
    if (identityRecognized) return line
    const needsReview = [...line.needs_review]
    needsReview.push(evidence.supplier_id === profile.supplier.id ? 'supplier_identity_unrecognized' : 'supplier_id_mismatch')
    return { ...line, status: line.status === 'excluded' ? 'excluded' : 'needs_review', needs_review: needsReview }
  }
  return {
    supplier_profile_id: profile.id,
    supplier_profile_version: profile.version,
    supplier_identity: identityRecognized ? 'recognized' : 'needs_review',
    lines: evidence.table.rows.map(makeLine),
  }
}
