/** Explicación en lenguaje de negocio de cada bloqueo de revisión K5. */
export const REVIEW_REASON_LABEL: Record<string, string> = {
  producto_sin_mapping: 'Elige el ingrediente de este producto; la asociación se guardará.',
  varios_ingredientes_posibles: 'Hay varios ingredientes posibles; elige el correcto.',
  mapping_requires_human_review: 'El nombre se parece a un producto conocido, pero debes confirmar que es el mismo ingrediente.',
  presentacion_sin_validar: 'Confirma cómo se convierte esta presentación a la unidad de compra.',
  unidad_facturada_incompatible: 'La unidad facturada no coincide con la presentación guardada; comprueba el formato.',
  cantidad_ausente_o_invalida: 'Comprueba la cantidad en la fotografía.',
  precio_ausente_o_invalido: 'Comprueba el precio unitario en la fotografía.',
  importe_ausente_o_invalido: 'Comprueba el importe de esta línea en la fotografía.',
  cantidad_precio_importe_no_reconcilian: 'Cantidad por precio no coincide con el importe; corrige el dato leído.',
  descuento_sin_porcentaje_verificado: 'Confirma cómo se aplica el descuento mostrado.',
  precio_neto_contradictorio: 'El precio neto no coincide con el descuento; revisa ambos valores.',
  cargo_adicional_sin_concepto: 'Hay un cargo sin concepto claro; comprueba el documento.',
  subtotal_iva_total_no_reconcilian: 'Subtotal e IVA no suman el total del albarán.',
  lineas_subtotal_no_reconcilian: 'La suma de líneas no coincide con el subtotal.',
  lineas_total_no_reconcilian: 'La suma de líneas no coincide con el total.',
  total_documento_no_verificable: 'Comprueba el total del documento: sin ese dato no podemos verificar si falta algún artículo.',
  contenido_de_caja_invalido: 'Comprueba el contenido de cada caja.',
  unidades_por_caja_invalidas: 'Comprueba cuántas unidades contiene cada caja.',
  conversion_de_presentacion_incompatible: 'La presentación guardada no permite convertir esta cantidad.',
  mapping_presentation_incompatible: 'La presentación no se puede convertir a la unidad de compra o de stock del ingrediente. Revisa sus unidades y el contenido del envase.',
  cantidad_supera_precision_k4: 'La cantidad requiere más decimales de los que admite la recepción.',
  redondeo_economico_no_reconcilia: 'El redondeo del precio no reconcilia con el importe.',
  sin_lineas: 'No se detectaron líneas de producto; revisa la imagen.',
}

export function explainReviewReason(reason: string): string {
  return (
    REVIEW_REASON_LABEL[reason]
    ?? `Revisa la incidencia de esta línea (${reason.replaceAll('_', ' ')}).`
  )
}
