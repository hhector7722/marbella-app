import {readFile} from 'node:fs/promises';
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {readChatPdf} from './pdf-attachment.ts';

test('lee todas las páginas de un PDF real y no sólo la primera',async()=>{
  const bytes=await readFile('public/docs/codigo_conducta.pdf');
  const result=await readChatPdf(bytes);
  assert.equal(result.pages,2);
  assert.equal(result.scanned,false);
  assert.match(result.text,/Página 1:/);
  assert.match(result.text,/Página 2:/);
  assert.match(result.text,/Organitzaci/);
});

test('trunca documentos largos sin asumir que solo existe página 1',async()=>{
  const bytes=await readFile('public/docs/convenio.pdf');
  const result=await readChatPdf(bytes);
  assert.equal(result.pages,85);
  assert.equal(result.text.length,14000);
  assert.match(result.text,/Página 1:/);
});

test('rechaza contenido que no es un PDF real',async()=>{
  await assert.rejects(()=>readChatPdf(Buffer.from('no-pdf')),/PDF válido/);
});
