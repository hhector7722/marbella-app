/**
 * Router de inferencia SOLO servidor. Nunca recibe claves desde el navegador.
 * Se limita a los modelos expresamente verificados como gratuitos.
 * No delega la ejecución de herramientas ni los permisos de Supabase.
 */
import type { GroqChatMessage, GroqTool, GroqToolCall } from './groq-chat.ts';

export type FreeProvider = 'groq' | 'xkiro' | 'openrouter';
export type FreeProviderKeys = Partial<Record<FreeProvider, string>>;
export type FreeChatResult = {
  content: string;
  toolCalls: GroqToolCall[];
  provider: FreeProvider;
};
export type FreeChatOptions = {
  keys: FreeProviderKeys;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  deadlineMs?: number;
  toolChoice?: 'auto' | 'required';
  preferredProvider?: FreeProvider;
};

type ProviderConfig = {
  name: FreeProvider;
  endpoint: string;
  model: string;
};

/** Prohibido introducir modelos de pago o routers sin restricción de coste. */
const FREE_PROVIDERS: readonly ProviderConfig[] = [
  { name: 'groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b' },
  { name: 'xkiro', endpoint: 'https://api.xkiro.com/v1/chat/completions', model: 'mistralai/mistral-small-2603' },
  { name: 'openrouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'nvidia/nemotron-3.5-lightning:free' },
];

export class FreeChatError extends Error {
  readonly code: 'not_configured' | 'providers_exhausted';
  readonly status: number;
  constructor(code: 'not_configured' | 'providers_exhausted', status: number, message: string) {
    super(message);
    this.name = 'FreeChatError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Solo modelos gratuitos revisados de la lista FREE_PROVIDERS.
 * OpenRouter utiliza exclusivamente un modelo gratuito con ZDR obligatorio.
 * No se usan Nemotron, Liquid u otros modelos que admiten datos de entrenamiento,
 * ni el router aleatorio openrouter/free.
 */
export function operationalFreeProviderKeys(keys: FreeProviderKeys): FreeProviderKeys {
  return { groq: keys.groq, xkiro: keys.xkiro, openrouter: keys.openrouter };
}

export function configuredFreeProviders(keys: FreeProviderKeys): FreeProvider[] {
  return FREE_PROVIDERS.filter(({ name }) => Boolean(keys[name]?.trim())).map(({ name }) => name);
}

function parseCompletion(payload: unknown, tools: GroqTool[], required: boolean): Omit<FreeChatResult, 'provider'> | null {
  if (!payload || typeof payload !== 'object') return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return null;
  const choice = choices[0];
  if (!choice || typeof choice !== 'object') return null;
  if ((choice as { finish_reason?: unknown }).finish_reason === 'length') return null;
  const message = (choice as { message?: unknown }).message;
  if (!message || typeof message !== 'object') return null;
  const raw = message as { content?: unknown; tool_calls?: unknown };
  const allowed = new Set(tools.map(t => t.function.name));
  const toolCalls: GroqToolCall[] = [];
  if (raw.tool_calls !== undefined) {
    if (!Array.isArray(raw.tool_calls)) return null;
    for (const candidate of raw.tool_calls) {
      if (!candidate || typeof candidate !== 'object') return null;
      const call = candidate as { id?: unknown; type?: unknown; function?: unknown };
      const fn = call.function as { name?: unknown; arguments?: unknown } | null;
      if (typeof call.id !== 'string' || !call.id || call.type !== 'function' ||
          !fn || typeof fn.name !== 'string' || !allowed.has(fn.name) ||
          typeof fn.arguments !== 'string') return null;
      try {
        const args: unknown = JSON.parse(fn.arguments);
        if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
      } catch {
        return null;
      }
      toolCalls.push({ id: call.id, type: 'function', function: { name: fn.name, arguments: fn.arguments } });
    }
  }
  if (required && toolCalls.length === 0) return null;
  const content = typeof raw.content === 'string' ? raw.content : '';
  if (!content.trim() && toolCalls.length === 0) return null;
  return { content, toolCalls };
}

/**
 * Un intento por proveedor y por paso. El reloj global evita exceder
 * maxDuration=60 de Vercel si el agente realiza varias tool calls.
 * Un error de proveedor NUNCA desencadena una ejecución de herramientas.
 */
export async function completeFreeChat(
  messages: GroqChatMessage[],
  tools: GroqTool[],
  options: FreeChatOptions,
): Promise<FreeChatResult> {
  const available = FREE_PROVIDERS.filter(p => Boolean(options.keys[p.name]?.trim()));
  if (!available.length) {
    throw new FreeChatError('not_configured', 503,
      'No hay claves de proveedores gratuitos configuradas en Vercel.');
  }
  const ordered = options.preferredProvider
    ? [...available.filter(p => p.name === options.preferredProvider), ...available.filter(p => p.name !== options.preferredProvider)]
    : available;
  const required = options.toolChoice === 'required' && tools.length > 0;
  const fetcher = options.fetcher ?? fetch;
  const deadline = options.deadlineMs ?? Date.now() + 47000;
  let quotaBlocked = false;
  for (const provider of ordered) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    const key = options.keys[provider.name]?.trim();
    if (!key) continue;
    const isGroq = provider.name === 'groq';
    const body = {
      model: provider.model,
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? (options.toolChoice ?? 'auto') : undefined,
      ...(isGroq ? {
        parallel_tool_calls: false,
        reasoning_effort: 'low',
        max_completion_tokens: 1400,
      } : {
        // Los modelos gratis Qwen pueden gastar parte del límite en razonamiento;
        // 1400 provocaba respuestas truncadas que el validador descarta.
        max_tokens: 2800,
      }),
      temperature: 0.2,
      ...(provider.name === 'openrouter' ? {
        // Fail closed: sin endpoint con ZDR, no se envía la solicitud a otro.
        provider: {
          zdr: true,
          data_collection: 'deny',
          allow_fallbacks: false,
          require_parameters: true,
        },
      } : {}),
    };
    try {
      const response = await fetcher(provider.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          ...(provider.name === 'openrouter' ? { 'X-Title': 'Marbella App' } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(500, Math.min(options.timeoutMs ?? 12500, remaining))),
        cache: 'no-store',
      });
      if (!response.ok) {
        if (response.status === 429) quotaBlocked = true;
        // Solo proveedor y estado HTTP. Nunca registrar el cuerpo de respuesta.
        console.warn('[copiloto-provider]', provider.name, 'http', response.status);
        continue;
      }
      const payload: unknown = await response.json();
      const parsed = parseCompletion(payload, tools, required);
      // Algunos endpoints gratis ignoran tool_choice. No aceptamos una
      // respuesta plana como éxito cuando el servidor exigió una herramienta.
      if (!parsed) {
        // El motivo se limita a códigos fijos; nada de contenido ni argumentos.
        const choice = (payload as { choices?: Array<{ finish_reason?: unknown }> })?.choices?.[0];
        const finish = choice?.finish_reason;
        const reason = finish === 'length' ? 'truncated'
          : finish === 'content_filter' ? 'filtered'
          : required ? 'missing_or_invalid_tool_call' : 'empty_or_invalid_completion';
        console.warn('[copiloto-provider]', provider.name, reason);
        continue;
      }
      return { ...parsed, provider: provider.name };
    } catch (error) {
      // Fallos de red, timeout o JSON inválido; no imprimir el error/cuerpo.
      console.warn('[copiloto-provider]', provider.name,
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
          ? 'timeout' : 'transport_or_json_error');
      continue;
    }
  }
  const soleGroq = ordered.length === 1 && ordered[0].name === 'groq';
  throw new FreeChatError('providers_exhausted', quotaBlocked ? 429 : 503,
    soleGroq && quotaBlocked
      ? 'Límite del plan gratuito de Groq alcanzado. Inténtalo más tarde.'
      : 'Los proveedores gratuitos configurados no están disponibles o no han devuelto una respuesta compatible.');
}
