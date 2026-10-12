import assert from 'node:assert/strict'
import test from 'node:test'
import { explainReceiptProposalMismatch } from './receipt-mismatch.ts'

const proposal = {
  id: 'proposal-1',
  mapping_version_id: 'mapping-1',
  ingredient_id: 'ingredient-1',
  source_item_name: 'Bandejas bocadillos',
  line_quantity: '1',
  line_unit: 'ud',
  observed_unit_price: '10.75',
  line_total: '10.75',
}

const line = {
  interpretation_proposal_id: proposal.id,
  mapped_ingredient_id: proposal.ingredient_id,
  original_name: proposal.source_item_name,
  quantity: '1.000',
  line_unit: 'ud',
  unit_price: '10.7500',
  total_price: '10.75',
}

test('explica qué corregir cuando el OCR dejó vacía la unidad de una revisión válida', () => {
  const message = explainReceiptProposalMismatch({ ...line, line_unit: null }, proposal, 'mapping-1')
  assert.match(message, /unidad facturada/i)
  assert.match(message, /Revisar compra/)
})

test('envía al campo correcto según la diferencia real', () => {
  assert.match(explainReceiptProposalMismatch({ ...line, quantity: '2' }, proposal, 'mapping-1'), /cantidad/i)
  assert.match(explainReceiptProposalMismatch({ ...line, unit_price: '11' }, proposal, 'mapping-1'), /precio o importe/i)
  assert.match(explainReceiptProposalMismatch({ ...line, original_name: 'Otro artículo' }, proposal, 'mapping-1'), /nombre/i)
  assert.match(explainReceiptProposalMismatch({ ...line, mapped_ingredient_id: 'otro' }, proposal, 'mapping-1'), /ingrediente/i)
  assert.match(explainReceiptProposalMismatch({ ...line, interpretation_proposal_id: 'otra' }, proposal, 'mapping-1'), /revisión más reciente/i)
  assert.match(explainReceiptProposalMismatch(line, proposal, 'mapping-2'), /presentación seleccionada/i)
})

test('acepta escalas decimales y mayúsculas equivalentes al comparar con K4', () => {
  assert.match(
    explainReceiptProposalMismatch({ ...line, line_unit: 'UD', original_name: ' bandejas bocadillos ' }, proposal, 'mapping-1'),
    /cambió mientras la revisabas/i
  )
})
