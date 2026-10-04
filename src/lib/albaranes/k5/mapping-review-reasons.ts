type MappingReviewInput = {
  previousReasons: string[]
  hasResolvedName: boolean
  hasMappedSnapshot: boolean
  humanLineOverride: boolean
  quantity: number | null
  unitPrice: number | null
  lineTotal: number | null
  verifiedObservedMath?: boolean
}

/** Resolve only facts explicitly supplied by the reviewer; keep economic and
 * document reconciliation failures until their own evidence is corrected. */
export function resolveMappingReviewReasons(input: MappingReviewInput): string[] {
  return input.previousReasons.filter((reason) => {
    if ([
      'mapping_missing',
      'mapping_requires_human_review',
      'legacy_identity_requires_presentation_validation',
      'producto_sin_mapping',
      'varios_ingredientes_posibles',
    ].includes(reason)) return false

    if (input.hasMappedSnapshot && [
      'mapping_presentation_incompatible',
      'price_not_normalizable',
      'unknown_quantity_unit',
      'presentacion_sin_validar',
      'unidad_facturada_incompatible',
      'conversion_de_presentacion_incompatible',
      'contenido_de_caja_invalido',
      'unidades_por_caja_invalidas',
      'mixed_measurement_requires_review',
      'unsupported_presentation',
    ].includes(reason)) return false

    if (['missing_product', 'product_missing'].includes(reason) && input.hasResolvedName) return false
    if (['missing_quantity', 'cantidad_ausente_o_invalida'].includes(reason) && input.quantity != null && input.quantity > 0) return false
    if (['missing_unit_price', 'precio_ausente_o_invalido'].includes(reason) && input.unitPrice != null && input.unitPrice > 0) return false
    if (['missing_line_amount', 'importe_ausente_o_invalido'].includes(reason) && input.lineTotal != null && input.lineTotal > 0) return false
    if (reason === 'cantidad_precio_importe_no_reconcilian' && input.verifiedObservedMath) return false
    if (input.hasMappedSnapshot && input.humanLineOverride && [
      'discount_not_interpretable',
      'discount_requires_review',
      'line_amount_mismatch',
    ].includes(reason)) return false
    return true
  })
}
