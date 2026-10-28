import assert from 'node:assert/strict'
import test from 'node:test'
import { documentStockFullyRegistered } from './fully-processed.ts'

const lines = [{id:'a',status:'mapped'},{id:'b',status:'mapped'}]
const receipts = [
  {purchase_invoice_line_id:'a',stock_movement_id:'move-a'},
  {purchase_invoice_line_id:'b',stock_movement_id:'move-b'},
]
test('albarán recibido por email pasa a procesado solo tras guardar todo el stock',()=>{
  assert.equal(documentStockFullyRegistered(lines,receipts),true)
  assert.equal(documentStockFullyRegistered(lines,receipts.slice(0,1)),false)
  assert.equal(documentStockFullyRegistered(lines,[...receipts.slice(0,1),receipts[0]!]),false)
  assert.equal(documentStockFullyRegistered(lines,[receipts[0]!,{...receipts[1]!,stock_movement_id:null}]),false)
  assert.equal(documentStockFullyRegistered([{id:'a',status:'pending'},lines[1]!],receipts),false)
  assert.equal(documentStockFullyRegistered([],receipts),false)
})
