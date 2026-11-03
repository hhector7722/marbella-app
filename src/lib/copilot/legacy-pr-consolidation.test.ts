import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = (path: string) => readFileSync(join(SRC_ROOT, path), 'utf8');

describe('PR #107: integración en el agente operativo actual', () => {
  it('Agente IA abre el chat global sin duplicar el asistente', () => {
    const menu = source('components/modals/MasterMoreFunctionsModal.tsx');
    const layout = source('app/layout.tsx');
    assert.match(menu, /label: 'Agente IA'[^\n]*action: 'asistente'/);
    assert.match(menu, /asistente: openChat/);
    assert.match(menu, /useAIStore\(\(state\) => state\.openChat\)/);
    assert.match(layout, /<ChatMarbellaLazy\s*\/>/);
  });

  it('mantiene el backend principal con Groq y herramientas de solo consulta', () => {
    const route = source('app/api/copiloto/route.ts');
    const chat = source('components/chat/ChatMarbella.tsx');
    assert.match(chat, /api: '\/api\/copiloto'/);
    assert.match(route, /groq: process\.env\.GROQ_API_KEY/);
    assert.match(route, /operationalFreeProviderKeys\(/);
    assert.match(route, /completeFreeChat\(/);
    assert.match(route, /const READ_ONLY_TOOLS = new Set/);
    assert.match(route, /Nunca sugieras que has ejecutado una acción de escritura/);
  });

  it('el contexto del borrador de proveedor solo es informativo', () => {
    const chat = source('components/chat/ChatMarbella.tsx');
    const route = source('app/api/copiloto/route.ts');
    assert.match(chat, /window\.location\.pathname === '\/orders\/new'/);
    assert.match(chat, /kind: 'supplier_draft', supplier: supplierName\.slice\(0, 120\)/);
    assert.match(route, /pageCtx\.kind === 'supplier_draft'/);
    assert.match(route, /typeof pageCtx\.supplier === 'string'/);
    assert.match(route, /NO verificado/);
    assert.match(route, /no autoriza ninguna operación/);
  });

  it('los errores del proveedor no se presentan como fallos de Internet', () => {
    const chat = source('components/chat/ChatMarbella.tsx');
    assert.match(chat, /No se ha podido obtener una respuesta del asistente/);
    assert.doesNotMatch(chat, /Error de conexión\./);
  });
});
