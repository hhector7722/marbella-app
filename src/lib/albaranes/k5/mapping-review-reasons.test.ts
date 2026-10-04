import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveMappingReviewReasons } from './mapping-review-reasons.ts'

test('un mapeo humano válido resuelve las dudas de identidad y presentación Mistral', () => {
  const reasons = resolveMappingReviewReasons({
    previousReasons: [
      'producto_sin_mapping',
      'presentacion_sin_validar',
      'unidad_facturada_incompatible',
      'cantidad_precio_importe_no_reconcilian',
      'lineas_subtotal_no_reconcilian',
    ],
    hasResolvedName: true,
    hasMappedSnapshot: true,
    humanLineOverride: false,
    quantity: 2,
    unitPrice: 16.28,
    lineTotal: 19.2,
  })
  assert.deepEqual(reasons, [
    'cantidad_precio_importe_no_reconcilian',
    'lineas_subtotal_no_reconcilian',
  ])
})

test('una presentación elegida por el usuario deja la línea sin ese bloqueo', () => {
  assert.deepEqual(resolveMappingReviewReasons({
    previousReasons: ['presentacion_sin_validar'],
    hasResolvedName: true,
    hasMappedSnapshot: true,
    humanLineOverride: false,
    quantity: 1,
    unitPrice: 12,
    lineTotal: 12,
  }), [])
})

test('SHERS: el mapeo no oculta descuentos ni importes contradictorios', () => {
  const reasons = resolveMappingReviewReasons({
    previousReasons: [
      'descuento_sin_porcentaje_verificado',
      'cantidad_precio_importe_no_reconcilian',
      'precio_neto_contradictorio',
      'presentacion_sin_validar',
      'lineas_subtotal_no_reconcilian',
    ],
    hasResolvedName: true,
    hasMappedSnapshot: true,
    humanLineOverride: false,
    quantity: 2,
    unitPrice: 16.28,
    lineTotal: 19.2,
  })
  assert.deepEqual(reasons, [
    'descuento_sin_porcentaje_verificado',
    'cantidad_precio_importe_no_reconcilian',
    'precio_neto_contradictorio',
    'lineas_subtotal_no_reconcilian',
  ])
})

test('un mapeo incompleto conserva los bloqueos de presentación y económicos', () => {
  const reasons = resolveMappingReviewReasons({
    previousReasons: ['presentacion_sin_validar', 'conversion_de_presentacion_incompatible', 'precio_neto_contradictorio'],
    hasResolvedName: true,
    hasMappedSnapshot: false,
    humanLineOverride: false,
    quantity: 8,
    unitPrice: 17.57,
    lineTotal: 88.18,
  })
  assert.deepEqual(reasons, ['presentacion_sin_validar', 'conversion_de_presentacion_incompatible', 'precio_neto_contradictorio'])
})

test('solo una comprobación nueva de la evidencia resuelve el aviso aritmético previo', () => {
  assert.deepEqual(resolveMappingReviewReasons({
    previousReasons: ['cantidad_precio_importe_no_reconcilian', 'lineas_subtotal_no_reconcilian'],
    hasResolvedName: true,
    hasMappedSnapshot: true,
    humanLineOverride: false,
    quantity: 10,
    unitPrice: 5.56,
    lineTotal: 55.6,
    verifiedObservedMath: true,
  }), ['lineas_subtotal_no_reconcilian'])
})
