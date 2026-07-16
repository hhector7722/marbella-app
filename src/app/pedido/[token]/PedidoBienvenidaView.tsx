'use client'

import Image from 'next/image'
import { CalendarDays, Clock, Users, Utensils } from 'lucide-react'

import { formatClientPedidoDate, formatClientPedidoTime } from '@/lib/client-pedido-link'
import { cn } from '@/lib/utils'

/** Pantalla de bienvenida antes de abrir la carta (flujo cliente por enlace). */
export function PedidoBienvenidaView({
  customerName,
  eventDate,
  eventTime,
  guestCount,
  orderName,
  onStart,
}: {
  customerName: string
  eventDate: string
  eventTime: string
  guestCount?: number | null
  orderName?: string | null
  onStart: () => void
}) {
  const name = String(customerName ?? '').trim() || 'cliente'
  const dateLabel = formatClientPedidoDate(eventDate)
  const timeLabel = formatClientPedidoTime(eventTime)
  const pax = guestCount != null && guestCount > 0 ? guestCount : null
  const pedidoLabel = String(orderName ?? '').trim() || null

  return (
    <main className="flex min-h-[100dvh] flex-col bg-white text-zinc-900">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-safe pt-safe">
        <header className="shrink-0 flex flex-col items-center pt-6 pb-2">
          <Image
            src="/icons/logo-white.png"
            alt="Bar La Marbella"
            width={280}
            height={76}
            className="h-14 w-auto max-w-[240px] object-contain"
            priority
          />
          <p className="mt-3 text-[11px] font-black uppercase tracking-[0.2em] text-[#36606F]/80">
            Pedido
          </p>
        </header>

        <div className="flex flex-1 flex-col pt-4">
          <div className="flex-1 space-y-5">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">Hola, {name}</h1>
              <p className="mt-2 text-[15px] font-semibold leading-relaxed text-zinc-600">
                Tal y como hemos hablado, desde aquí podéis preparar vuestro pedido.
              </p>
            </div>

            <section className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
              <ul className="divide-y divide-zinc-100">
                {dateLabel ? (
                  <li className="flex min-h-12 items-center gap-3 py-2.5 first:pt-0">
                    <CalendarDays className="h-5 w-5 shrink-0 text-[#36606F]" strokeWidth={2.25} />
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                        Fecha
                      </p>
                      <p className="text-sm font-bold text-zinc-900">{dateLabel}</p>
                    </div>
                  </li>
                ) : null}
                {timeLabel ? (
                  <li className="flex min-h-12 items-center gap-3 py-2.5">
                    <Clock className="h-5 w-5 shrink-0 text-[#36606F]" strokeWidth={2.25} />
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                        Hora
                      </p>
                      <p className="text-sm font-bold text-zinc-900">{timeLabel}</p>
                    </div>
                  </li>
                ) : null}
                {pax != null ? (
                  <li className="flex min-h-12 items-center gap-3 py-2.5">
                    <Users className="h-5 w-5 shrink-0 text-[#36606F]" strokeWidth={2.25} />
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                        Personas
                      </p>
                      <p className="text-sm font-bold text-zinc-900">{pax}</p>
                    </div>
                  </li>
                ) : null}
                {pedidoLabel ? (
                  <li className="flex min-h-12 items-center gap-3 py-2.5 last:pb-0">
                    <Utensils className="h-5 w-5 shrink-0 text-[#36606F]" strokeWidth={2.25} />
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                        Pedido
                      </p>
                      <p className="truncate text-sm font-bold text-zinc-900">{pedidoLabel}</p>
                    </div>
                  </li>
                ) : null}
              </ul>
            </section>

            <p className="text-[14px] font-semibold leading-relaxed text-zinc-600">
              Podéis añadir todos los productos que queráis. Cuando terminéis, pulsad «Enviar
              pedido». Nuestro equipo recibirá vuestro pedido automáticamente.
            </p>
          </div>

          <div className="shrink-0 pt-6 pb-4">
            <button
              type="button"
              onClick={onStart}
              className={cn(
                'flex w-full min-h-14 items-center justify-center rounded-xl',
                'bg-[#36606F] text-[13px] font-black uppercase tracking-widest text-white',
                'active:opacity-90 hover:bg-[#2a4a56]'
              )}
            >
              Empezar pedido
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
