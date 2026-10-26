import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {freezeChatBackground} from './background-page-lock.ts';

function fakeDocument(){
  const bodyStyle={
    position:'',top:'',left:'',right:'',width:'',
  };
  const htmlStyle={overscrollBehavior:''};
  const doc={body:{style:bodyStyle},documentElement:{style:htmlStyle}};
  return {doc:doc as unknown as Document,bodyStyle,htmlStyle};
}

test('el fondo queda inmóvil en la posición original incluso al enfocar el teclado',()=>{
  const {doc,bodyStyle,htmlStyle}=fakeDocument();
  let restoredAt=-1;
  const unlock=freezeChatBackground(doc,427,(y)=>{restoredAt=y;});
  assert.equal(bodyStyle.position,'fixed');
  assert.equal(bodyStyle.top,'-427px');
  assert.equal(bodyStyle.width,'100%');
  assert.equal(htmlStyle.overscrollBehavior,'none');
  assert.equal(restoredAt,-1);
  unlock();
  assert.equal(restoredAt,427);
  assert.equal(bodyStyle.position,'');
  assert.equal(bodyStyle.top,'');
  assert.equal(htmlStyle.overscrollBehavior,'');
});

test('respeta los estilos anteriores y sólo restaura una vez',()=>{
  const {doc,bodyStyle,htmlStyle}=fakeDocument();
  Object.assign(bodyStyle,{position:'relative',top:'4px',left:'2px',right:'7px',width:'93%'});
  htmlStyle.overscrollBehavior='contain';
  let calls=0;
  const unlock=freezeChatBackground(doc,0,()=>{calls++;});
  unlock();
  unlock();
  assert.equal(calls,1);
  assert.deepEqual(bodyStyle,{position:'relative',top:'4px',left:'2px',right:'7px',width:'93%'});
  assert.equal(htmlStyle.overscrollBehavior,'contain');
});

test('scroll negativo inesperado no desplaza la página hacia abajo',()=>{
  const {doc,bodyStyle}=fakeDocument();
  const unlock=freezeChatBackground(doc,-99,(y)=>assert.equal(y,0));
  assert.equal(bodyStyle.top,'-0px');
  unlock();
});
