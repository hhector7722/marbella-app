import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeChatImage, FreeVisionError } from './free-vision.ts';

const content='Foto con precio legible';
const ok=()=>new Response(JSON.stringify({
  choices:[{finish_reason:'stop',message:{content}}],
}),{status:200});

test('imagen: 503 de Groq pasa a xKiro gratis con la misma imagen',async()=>{
  const seen:string[]=[];
  const result=await describeChatImage('aGVsbG8=',{groq:'test-g',xkiro:'test-x'},{
    fetcher:(async(url:RequestInfo|URL,init?:RequestInit)=>{
      const u=String(url);seen.push(new URL(u).hostname);
      const body=JSON.parse(String(init?.body)) as {model:string;messages:Array<{content:Array<{image_url?:{url:string}}>}>};
      assert.equal(body.messages[0].content[1].image_url?.url,'data:image/jpeg;base64,aGVsbG8=');
      if(u.includes('groq.com'))return new Response('{}',{status:503});
      assert.equal(body.model,'qwen/qwen3.8-max:free');
      return ok();
    }) as typeof fetch,
  });
  assert.equal(result.provider,'xkiro');
  assert.equal(result.content,content);
  assert.deepEqual(seen,['api.groq.com','api.xkiro.com']);
});

test('imagen: sólo claves disponibles y no modelos de pago',async()=>{
  let calls=0;
  const result=await describeChatImage('Zm9v',{xkiro:'test'},{
    fetcher:(async(url:RequestInfo|URL,init?:RequestInit)=>{
      calls++;
      assert.match(String(url),/api.xkiro.com/);
      assert.match(String(init?.body),/qwen3.8-max:free/);
      return ok();
    }) as typeof fetch,
  });
  assert.equal(calls,1);
  assert.equal(result.provider,'xkiro');
});

test('imagen: sin clave no realiza llamadas',async()=>{
  let calls=0;
  await assert.rejects(describeChatImage('Zm9v',{},{
    fetcher:(async()=>{calls++;return ok()}) as typeof fetch,
  }),e=>e instanceof FreeVisionError&&e.code==='not_configured');
  assert.equal(calls,0);
});

test('imagen: no acepta salida vacía y cambia proveedor',async()=>{
  let count=0;
  const result=await describeChatImage('Zm9v',{groq:'g',xkiro:'x'},{
    fetcher:(async()=>{count++;return count===1
      ? new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'incompleta'}}]}),{status:200})
      : ok()}) as typeof fetch,
  });
  assert.equal(result.provider,'xkiro');
});

test('imagen: sin presupuesto de tiempo no inicia solicitudes',async()=>{
  let calls=0;
  await assert.rejects(describeChatImage('Zm9v',{groq:'g'},{
    deadlineMs:Date.now()-100,
    fetcher:(async()=>{calls++;return ok()}) as typeof fetch,
  }),e=>e instanceof FreeVisionError&&e.code==='providers_exhausted');
  assert.equal(calls,0);
});
