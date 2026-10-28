import assert from 'node:assert/strict'
import test from 'node:test'
import { albaranPriceChangeUrl, notificationDestination, isImportantPriceChange, priceChangeRatio, readIngredientReclassification } from './price-change-alerts.ts'

const id = 'c756690f-399d-460a-81f6-024c93bb86d7'
test('nuevo aviso apunta al albarán concreto y abre diferencias de precio', () => {
  assert.equal(albaranPriceChangeUrl(id), '/dashboard/albaranes?id=' + id + '&price_changes=1')
  assert.equal(notificationDestination({ type:'albaran_price_variation',
    entity_id:id,action_url:'/dashboard/albaranes'}), albaranPriceChangeUrl(id))
  assert.equal(notificationDestination({ type:'reservation_new',
    entity_id:id, action_url:'/staff/reservas'}), '/staff/reservas')
  assert.equal(notificationDestination({ type:'albaran_price_variation',
    entity_id:'malformed', action_url:'/dashboard/albaranes'}), '/dashboard/albaranes')
})

test('precios anteriores y nuevos: subida o bajada y guardas de precio', () => {
  assert.equal(priceChangeRatio(1.09,1.56), (1.56-1.09)/1.09)
  assert.equal(isImportantPriceChange(1.09,1.56),true)
  assert.equal(isImportantPriceChange(1.56,1.09),true)
  assert.equal(isImportantPriceChange(1,1.25),false)
  assert.equal(isImportantPriceChange(null,2),false)
  assert.equal(isImportantPriceChange(1,2,true),false)
})


test('la rectificación Nanas no confunde el precio de Uninox con el de Nanas', () => {
  const correction = readIngredientReclassification({
    schema_version:'albaran-reclassification-v1',kind:'correction_credit',
    line_id:'nanas-line',invalidated_price_line_id:'uninox-line',
    new_ingredient_name:'Nanas',price_before:1.56,price_after:1.09
  })
  assert.equal(correction?.effectiveIngredientName,'Nanas')
  assert.equal(correction?.invalidatedPriceLineId,'uninox-line')
  assert.equal(isImportantPriceChange(correction!.priceBefore,correction!.priceAfter),true)
  assert.equal(readIngredientReclassification({kind:'other',line_id:'nanas-line'}),null)
})
