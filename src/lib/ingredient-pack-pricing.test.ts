import assert from 'node:assert/strict'
import test from 'node:test'
import {
  billingMassVolumeNormForAuto,
  buildAutomaticSameFamilyDimensional,
  deriveReceiptPresentationEconomics,
  sameMassVolumeFamilyBillingAndIngredient,
} from './ingredient-pack-pricing.ts'

test('1 caja de 125 g a 2,49 € normaliza a 19,92 €/kg', () => {
  const result = deriveReceiptPresentationEconomics({
    contentQty: 125,
    contentUnit: 'g',
    purchaseUnit: 'kg',
    observedUnitPrice: 2.49,
  })
  assert.ok(result)
  assert.equal(result.conversionFactor, 0.125)
  assert.equal(result.normalizedUnitPrice, 19.92)
  assert.equal(result.purchaseUnit, 'kg')
})

test('una unidad contable mantiene factor y precio 1:1', () => {
  const result = deriveReceiptPresentationEconomics({
    contentQty: 1,
    contentUnit: 'ud',
    purchaseUnit: 'ud',
    observedUnitPrice: 3.25,
  })
  assert.deepEqual(result, {
    conversionFactor: 1,
    normalizedUnitPrice: 3.25,
    purchaseUnit: 'ud',
  })
})

test('rechaza familias incompatibles', () => {
  assert.equal(
    deriveReceiptPresentationEconomics({
      contentQty: 125,
      contentUnit: 'g',
      purchaseUnit: 'l',
      observedUnitPrice: 2.49,
    }),
    null
  )
})

test('QUILOS del albarán se convierte automáticamente a 1 kg sin contar piezas de la caja', () => {
  const ingredient = { purchase_unit: 'kg', pack_units: 6 }
  const billingUnit = billingMassVolumeNormForAuto('QUILOS', 'QUILOS')
  assert.equal(billingUnit, 'kg')
  assert.equal(sameMassVolumeFamilyBillingAndIngredient(billingUnit, ingredient), true)
  const dimensional = buildAutomaticSameFamilyDimensional(billingUnit!, ingredient, 'QUILOS')
  assert.deepEqual(dimensional, {
    lineBillingUnit: 'QUILOS', lineContentQty: '1', lineContentUnit: 'kg', conversionFactor: 1,
  })
  const economics = deriveReceiptPresentationEconomics({
    contentQty: Number(dimensional!.lineContentQty),
    contentUnit: dimensional!.lineContentUnit,
    purchaseUnit: ingredient.purchase_unit,
    observedUnitPrice: 13.52,
  })
  assert.equal(economics?.normalizedUnitPrice, 13.52)
  assert.equal(3.21 * dimensional!.conversionFactor, 3.21)
})
