'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function messageCombinedText(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  let out = ''
  for (const p of parts) {
    if (
      typeof p === 'object' &&
      p !== null &&
      (p as { type?: string }).type === 'text' &&
      typeof (p as { text?: string }).text === 'string'
    ) {
      out += (p as { text: string }).text
    }
  }
  return out.trim()
}

export function CopilotChat() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const sessionRef = useRef<string | null>(null)
  sessionRef.current = sessionId
  const [input, setInput] = useState('')

  const onSessionHeader = useCallback((res: Response) => {
    const sid = res.headers.get('X-Session-Id')
    if (sid) {
      sessionRef.current = sid
      setSessionId((prev) => prev ?? sid)
    }
    return res
  }, [])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/copiloto',
        fetch: async (url, opts) => {
          let mergedBody: BodyInit | null | undefined = opts?.body
          if (typeof opts?.body === 'string') {
            try {
              const j = JSON.parse(opts.body) as Record<string, unknown>
              mergedBody = JSON.stringify({
                ...j,
                sessionId: sessionRef.current ?? null,
              })
            } catch {
              mergedBody = opts.body
            }
          }

          const res = await fetch(url as RequestInfo, {
            ...opts,
            body: mergedBody,
            credentials: 'same-origin',
          })
          return onSessionHeader(res)
        },
      }),
    [onSessionHeader]
  )

  const { messages, sendMessage, status, error } = useChat({
    transport,
    onError: (err: Error) => {
      toast.error(`Error del copiloto: ${err.message}`)
    },
  })

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, status])

  const busy = status !== 'ready' && status !== 'error'

  const canSend = input.trim().length > 0 && !busy

  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-100 bg-white shadow-sm shrink-0',
        'flex flex-col gap-3 p-4 w-full max-w-xl'
      )}
    >
      <div className="shrink-0">
        <h3 className="text-lg font-semibold text-zinc-900 tracking-tight">
          Copiloto (texto)
        </h3>
        <p className="text-sm text-zinc-500">OpenAI + datos Bar La Marbella</p>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'flex flex-col gap-3 h-80 overflow-y-auto rounded-lg border border-zinc-100',
          'bg-zinc-50 p-3'
        )}
      >
        {messages.length === 0 && (
          <p className="text-zinc-400 text-sm text-center m-auto px-4">
            Pregunta por ventas, sala, tesorería, horas…
          </p>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={m.role === 'user' ? 'text-right' : 'text-left'}
          >
            <span
              className={cn(
                'inline-block px-4 py-2 rounded-2xl text-sm max-w-[85%] break-words',
                m.role === 'user'
                  ? 'bg-[#36606F] text-white'
                  : 'bg-white border border-zinc-200 text-zinc-800'
              )}
            >
              {messageCombinedText(m.parts)}
            </span>
          </div>
        ))}

        {busy && (
          <div className="text-left">
            <span className="inline-block px-4 py-2 rounded-2xl text-sm bg-white border border-zinc-200 text-zinc-500 animate-pulse">
              Consultando herramientas…
            </span>
          </div>
        )}

        {error && (
          <div className="text-center shrink-0">
            <span className="inline-block px-4 py-2 rounded-2xl text-sm bg-red-50 border border-red-200 text-red-600">
              Error de red. Intenta de nuevo.
            </span>
          </div>
        )}
      </div>

      <form
        className="flex gap-2 shrink-0 items-stretch"
        onSubmit={(e) => {
          e.preventDefault()
          const val = input.trim()
          if (!val || busy) return
          sendMessage(
            { text: val },
            { body: { sessionId: sessionRef.current ?? null } }
          )
          setInput('')
        }}
      >
        <input
          className={cn(
            'flex-1 min-h-[48px] border border-zinc-300 rounded-lg px-4 py-3 text-base',
            'focus:outline-none focus:ring-2 focus:ring-[#36606F]/30 transition-colors'
          )}
          placeholder="Ej: ¿Cómo va la venta hoy?"
          disabled={busy}
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={!canSend}
          className={cn(
            'bg-[#36606F] hover:bg-[#2a4d5a] text-white font-medium',
            'px-6 rounded-lg text-base shrink-0 min-h-[48px] transition-colors disabled:opacity-50'
          )}
        >
          Enviar
        </button>
      </form>
    </div>
  )
}
