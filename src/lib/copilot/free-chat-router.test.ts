import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeFreeChat, configuredFreeProviders, FreeChatError } from './free-chat-router.ts';
import type { GroqTool } from './groq-chat.ts';

const tool: GroqTool = {
  type: 'function',
  function: {
    name: 'consultar_ventas_productos',
    description: 'Ventas',
    parameters: { type: 'object', properties: { fecha: { type: 'string' } } },
  },
};
const messages = [{ role: 'user' as const, content: 'Ventas hoy' }];
const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const toolReply = (name = 'consultar_ventas_productos') => new Response(JSON.stringify({
  choices: [{ message: { content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name, arguments: '{"fecha":"hoy"}' } }] } }],
}), { status: 200 });

test('no invoca un proveedor sin clave', async () => {
  let calls = 0;
  const result = await completeFreeChat(messages, [], {
    keys: { openrouter: 'test' }, fetcher: (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      assert.equal(String(url), 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(JSON.parse(String(init?.body)).model, 'nvidia/nemotron-3.5-lightning:free');
      return reply('OK');
    }) as typeof fetch,
  });
  assert.equal(calls, 1);
  assert.equal(result.provider, 'openrouter');
});

test('caída de Groq por 429 conmuta a xKiro gratuito', async () => {
  const seen: string[] = [];
  const result = await completeFreeChat(messages, [tool], {
    keys: { groq: 'test-g', xkiro: 'test-x', openrouter: 'test-r' },
    toolChoice: 'required',
    fetcher: (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      seen.push(u);
      assert.ok(JSON.parse(String(init?.body)).model.endsWith(':free') || u.includes('groq.com'));
      return u.includes('groq.com') ? new Response('{}', { status: 429 }) : toolReply();
    }) as typeof fetch,
  });
  assert.equal(result.provider, 'xkiro');
  assert.equal(result.toolCalls[0].function.name, tool.function.name);
  assert.deepEqual(seen.map(x => new URL(x).hostname), ['api.groq.com', 'api.xkiro.com']);
});

test('respaldo que ignora herramienta obligatoria se salta y pasa a OpenRouter', async () => {
  const seen: string[] = [];
  const result = await completeFreeChat(messages, [tool], {
    keys: { xkiro: 'test-x', openrouter: 'test-r' }, toolChoice: 'required',
    fetcher: (async (url: RequestInfo | URL) => {
      seen.push(new URL(String(url)).hostname);
      return seen.length === 1 ? reply('Respuesta sin tools') : toolReply();
    }) as typeof fetch,
  });
  assert.equal(result.provider, 'openrouter');
  assert.deepEqual(seen, ['api.xkiro.com', 'openrouter.ai']);
});

test('tool call no autorizada nunca se acepta del proveedor', async () => {
  const result = await completeFreeChat(messages, [tool], {
    keys: { xkiro: 'x', openrouter: 'r' }, toolChoice: 'required',
    fetcher: (async (url: RequestInfo | URL) => String(url).includes('xkiro')
      ? toolReply('borrar_inventario') : toolReply()) as typeof fetch,
  });
  assert.equal(result.provider, 'openrouter');
});

test('respeta orden preferido tras una llamada anterior', async () => {
  const seen: string[] = [];
  await completeFreeChat(messages, [], {
    keys: { groq: 'g', xkiro: 'x', openrouter: 'r' }, preferredProvider: 'xkiro',
    fetcher: (async (url: RequestInfo | URL) => { seen.push(new URL(String(url)).hostname); return reply('Hecho'); }) as typeof fetch,
  });
  assert.deepEqual(seen, ['api.xkiro.com']);
});

test('no realiza reintentos sin tiempo global disponible', async () => {
  let calls = 0;
  await assert.rejects(completeFreeChat(messages, [], {
    keys: { groq: 'g', xkiro: 'x' }, deadlineMs: Date.now() - 100,
    fetcher: (async () => { calls++; return reply('No debería llamarse'); }) as typeof fetch,
  }), (e: unknown) => e instanceof FreeChatError && e.status === 503);
  assert.equal(calls, 0);
});

test('sin claves devuelve error 503 en vez de pasar a proveedores de pago', async () => {
  assert.deepEqual(configuredFreeProviders({}), []);
  await assert.rejects(completeFreeChat(messages, [], { keys: {} }),
    (e: unknown) => e instanceof FreeChatError && e.code === 'not_configured' && e.status === 503);
});

test('si solo existe Groq mantiene el mensaje de cuota agotada', async () => {
  await assert.rejects(completeFreeChat(messages, [], {
    keys: { groq: 'g' }, fetcher: (async () => new Response('{}', { status: 429 })) as typeof fetch,
  }), (e: unknown) => e instanceof FreeChatError && e.status === 429 && /Groq/.test(e.message));
});

test('una respuesta truncada no se acepta aunque incluya texto', async () => {
  const result = await completeFreeChat(messages, [], {
    keys: { groq: 'g', xkiro: 'x' },
    fetcher: (async (url: RequestInfo | URL) => String(url).includes('groq.com')
      ? new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: 'incompleto' } }] }), { status: 200 })
      : reply('respuesta completa')) as typeof fetch,
  });
  assert.equal(result.provider, 'xkiro');
});

test('un error de red recurre al siguiente proveedor y no filtra datos', async () => {
  let attempts = 0;
  const result = await completeFreeChat(messages, [], {
    keys: { groq: 'g', openrouter: 'r' },
    fetcher: (async () => {
      attempts++;
      if (attempts === 1) throw new Error('simulación de desconexión');
      return reply('continuación correcta');
    }) as typeof fetch,
  });
  assert.equal(result.provider, 'openrouter');
  assert.equal(attempts, 2);
});
