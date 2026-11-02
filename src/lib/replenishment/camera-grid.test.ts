import assert from 'node:assert/strict'
import test from 'node:test'
import { COLA_LAYOUT } from './assisted-scan.ts'
import { validImageQuad, projectImagePoint, nearestStackAt, observedPositions,
  trackImageQuad, grayFrame, type ImageQuad } from './camera-grid.ts'

const simple: ImageQuad = [
  { x: 35, y: 25 }, { x: 285, y: 25 }, { x: 285, y: 215 }, { x: 35, y: 215 },
]

test('geometría: homografía exacta y validación de cuadriláteros', () => {
  assert.equal(validImageQuad(simple), true)
  assert.equal(validImageQuad([simple[0],simple[3],simple[2],simple[1]]), false)
  assert.equal(validImageQuad([{x:3,y:3},...simple.slice(1)]), false)
  assert.deepEqual(projectImagePoint(simple, 0, 0),simple[0])
  const center=projectImagePoint(simple, 0.5, 0.5)
  assert.ok(center)
  assert.ok(Math.abs(center.x-160)<1e-7)
  assert.ok(Math.abs(center.y-120)<1e-7)
  const perspective: ImageQuad=[
    {x:65,y:48},{x:247,y:34},{x:286,y:201},{x:19,y:211},
  ]
  assert.equal(validImageQuad(perspective),true)
  for(const [index,uv] of [[0,[0,0]],[1,[1,0]],[2,[1,1]],[3,[0,1]]] as const) {
    const mapped=projectImagePoint(perspective,uv[0],uv[1])
    assert.ok(mapped)
    assert.ok(Math.hypot(mapped.x-perspective[index].x,mapped.y-perspective[index].y)<1e-5)
  }
})

test('asociación de círculo a posición fija: nunca cuenta bebida oculta',()=>{
  const center = projectImagePoint(simple, (2-.5)/7, (3-.5)/7)
  assert.ok(center)
  const found=observedPositions(simple,COLA_LAYOUT,[{...center,radius:12,confidence:0.91}])
  assert.deepEqual(found,['f3-c2'])
  assert.equal(nearestStackAt(simple,COLA_LAYOUT,center),'f3-c2')
  assert.equal(observedPositions(simple,COLA_LAYOUT,[{...center,radius:12,confidence:0.2}]).length,0)
  assert.equal(nearestStackAt(simple,COLA_LAYOUT,{x:12,y:12}),null)
})

test('seguimiento conservador del mapa ante traslación pequeña',()=>{
  const w=320,h=240
  const old=new Uint8Array(w*h)
  let seed=112233
  for(let i=0;i<old.length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0
    old[i]=seed>>>24
  }
  const moved=new Uint8Array(w*h)
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const xx=x-4, yy=y+3
    moved[y*w+x]=xx>=0 && yy<h?old[yy*w+xx]:0
  }
  const tracked=trackImageQuad(old,moved,simple,w,h)
  assert.ok(tracked,'la traslación debe poder seguirse')
  assert.ok(Math.abs(tracked[0].x-39)<1e-9)
  assert.ok(Math.abs(tracked[0].y-22)<1e-9)
  assert.equal(trackImageQuad(new Uint8Array(w*h),moved,simple,w,h),null)
  assert.equal(trackImageQuad(old,new Uint8Array(w*h),simple,w,h),null)
})

test('el gris de la cámara respeta los píxeles',()=>{
  const frame={width:2,height:1,data:new Uint8ClampedArray([0,0,0,255,255,255,255,255])}
  assert.deepEqual([...grayFrame(frame)],[0,256-1])
})
