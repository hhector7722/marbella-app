import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chatVisibleArea} from './chat-visible-area.ts';

test('sin teclado conserva el rectángulo visual y posición del chat',()=>{
  assert.deepEqual(chatVisibleArea({top:0,left:0,height:812,width:390}),
    {top:0,left:0,height:812,width:390});
});

test('Safari iPhone: teclado reduce solo altura, incluso tras enfocar y desplazar viewport',()=>{
  assert.deepEqual(chatVisibleArea({top:94,left:0,height:450,width:390}),
    {top:94,left:0,height:450,width:390});
});

test('Chrome overlays-content: teclado acorta alto aunque visualViewport no cambie',()=>{
  assert.deepEqual(chatVisibleArea({
    top:0,left:0,height:812,width:390,
    keyboardTop:502,keyboardHeight:310,
  }),{top:0,left:0,height:502,width:390});
});

test('si Safari ya reduce viewport, no se descuenta dos veces el teclado',()=>{
  assert.deepEqual(chatVisibleArea({
    top:45,left:0,height:440,width:390,keyboardTop:505,keyboardHeight:305,
  }),{top:45,left:0,height:440,width:390});
});

test('impide tamaños negativos y valores fuera de pantalla',()=>{
  assert.deepEqual(chatVisibleArea({
    top:-8,left:-7,height:0,width:0,keyboardTop:0,keyboardHeight:500,
  }),{top:0,left:0,height:1,width:1});
});
