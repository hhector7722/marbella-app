'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const {nodes,cents,verifyDelta,checkedJob}=require('./agent.cjs')
const before={headers:0,totals:[],lineSummary:[]}
const items=[{plu:25,name:'AIGUA 50CL.',quantity:1,price:1.5}]
const job={id:'test',table_number:50,items}
const after={headers:1,totals:[{total:1.5}],lineSummary:[{plu:25,qty:1}]}
test('validates table and catalog lines',()=>{
  assert.doesNotThrow(()=>checkedJob(job))
  assert.throws(()=>checkedJob({...job,table_number:0}))
  assert.throws(()=>checkedJob({...job,items:[...items,...items]}))
  assert.throws(()=>checkedJob({...job,items:[{...items[0],price:0}]}))
})
test('exact quantity and amount reconciliation',()=>{
  assert.equal(verifyDelta(before,after,items),true)
  assert.equal(verifyDelta(before,{...after,lineSummary:[{plu:25,qty:2}]},items),false)
  assert.equal(verifyDelta(before,{...after,totals:[{total:1.6}]},items),false)
  assert.equal(verifyDelta(before,{...after,lineSummary:[{plu:25,qty:1},{plu:6,qty:1}]},items),false)
})
test('appending to existing order preserves original quantities',()=>{
  const b={headers:1,totals:[{total:2.5}],lineSummary:[{plu:6,qty:1}]}
  const a={headers:1,totals:[{total:4}],lineSummary:[{plu:6,qty:1},{plu:25,qty:1}]}
  assert.equal(verifyDelta(b,a,items),true)
  assert.equal(verifyDelta(b,{...a,lineSummary:[{plu:25,qty:1}]},items),false)
})
test('UI tree isolates order lines from catalog and decodes XML',()=>{
  const result=nodes('<hierarchy><node resource-id="root"><node resource-id="listViewComanda"><node text="A &amp; B"/></node><node resource-id="catalog"><node text="C"/></node></node></hierarchy>')
  assert.deepEqual(result.filter(n=>n.ancestors.includes('listViewComanda')).map(n=>n.text),['A & B'])
  assert.throws(()=>nodes('<hierarchy>'))
})
test('valid money and malformed values',()=>{
  assert.equal(cents('1,50 €'),150)
  assert.equal(cents('0,00'),0)
  assert.throws(()=>cents('error'))
})
