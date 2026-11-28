import {test} from 'node:test'
import assert from 'node:assert/strict'
import {calculateBdpGrid} from './bdp-product-grid.ts'

test('pocas referencias tienen cards mayores y caben sin scroll',()=>{
  const small=calculateBdpGrid(6,369,550)
  const dense=calculateBdpGrid(20,369,550)
  assert.equal(small.fits,true)
  assert.ok(small.photoHeight>dense.photoHeight)
  assert.ok(small.columns<dense.columns)
  assert.equal(dense.visibleCount,20)
  assert.equal(dense.fits,true)
})
test('selecciona por capacidad, sin desbordamiento ni recortar filas al calcular',()=>{
  for(const w of [320,369,390,500,672]){
    for(const h of [250,400,550,680]){
      for(const count of [1,6,9,16,21,64]){
        for(const dual of [false,true]){
          const g=calculateBdpGrid(count,w,h,dual)
          assert.ok(g.columns>=1&&g.columns<=6)
          assert.ok(g.nameSize>=11&&g.controlsHeight>=40)
          assert.equal(g.rowHeight,g.photoHeight+g.infoHeight)
          assert.equal(g.visibleCount,Math.min(count,Math.floor((h+g.gap)/(g.rowHeight+g.gap))*g.columns))
          if(g.fits)assert.ok(Math.ceil(count/g.columns)*g.rowHeight+(Math.ceil(count/g.columns)-1)*g.gap<=h)
        }
      }
    }
  }
})
test('rotación y teclado: la cuadrícula se ajusta al área disponible',()=>{
  const narrow=calculateBdpGrid(21,320,600,true)
  const wide=calculateBdpGrid(21,672,600,true)
  assert.ok(wide.visibleCount>=narrow.visibleCount)
  assert.ok(calculateBdpGrid(21,369,300).visibleCount<=calculateBdpGrid(21,369,600).visibleCount)
})
