'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Loader2, Plus, X } from 'lucide-react'

import { buildDayAgendaListRows } from '@/lib/encargo-staff-helpers'
import { cn } from '@/lib/utils'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'
import type { EncargoRow } from '@/lib/reservas-encargos-calendar'

type Reservation = {
  id: string
  customer_name: string
  reservation_time: string
  pax: number
}

function parseLocalSafe(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function DayAgendaModal({
  dayYmd,
  reservations,
  encargos,
  plusPedidoBusy,
  onClose,
  onSelectReservation,
  onViewEncargoOrder,
  onPlusPedido,
}: {
  dayYmd: string
  reservations: Reservation[]
  encargos: EncargoRow[]
  plusPedidoBusy?: boolean
  onClose: () => void
  onSelectReservation: (r: Reservation) => void
  onViewEncargoOrder: (encargoId: string) => void
  onPlusPedido: () => void
}) {
  useModalUsageTracking({
    open: true,
    usageId: 'reservas-day-agenda',
    usageLabel: 'Agenda del día',
  })

  const rows = useMemo(
    () => buildDayAgendaListRows(reservations, encargos),
    [reservations, encargos]
  )

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        className={cn(
          'bg-white rounded-[2rem] shadow-2xl flex flex-col overflow-hidden',
          'w-full max-w-[min(32rem,calc(100vw-2rem))]',
          'max-h-[calc(100dvh-2rem)]',
          'animate-in zoom-in-95 duration-200'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#36606F] px-4 py-3 text-white shrink-0 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Agenda del día</p>
            <h3 className="text-base font-black capitalize truncate">
              {format(parseLocalSafe(dayYmd), 'EEEE d MMM', { locale: es })}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10 active:scale-95 transition shrink-0"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-2">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-xs font-semibold text-zinc-500">Nada programado este día.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {rows.map((row) => {
                if (row.kind === 'reservation') {
                  const full = reservations.find((r) => r.id === row.id)
                  if (!full) return null
                  return (
                    <li key={`res-${row.id}`} className="flex items-stretch gap-1 min-h-12">
                      <button
                        type="button"
                        onClick={() => onSelectReservation(full)}
                        className="flex-1 min-w-0 py-3 text-left grid grid-cols-[3.5rem_1fr] gap-2 items-center hover:bg-zinc-50 active:bg-zinc-100/80 transition rounded-lg"
                      >
                        <span className="text-[12px] font-mono font-bold text-zinc-700">{row.time}</span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-bold text-zinc-800 truncate">{row.title}</span>
                          <span className="block text-[10px] font-semibold text-zinc-500">{row.subtitle}</span>
                        </span>
                      </button>
                      {row.linkedEncargo ? (
                        <button
                          type="button"
                          onClick={() => onViewEncargoOrder(row.linkedEncargo!.id)}
                          className="shrink-0 self-center min-h-12 px-2 text-[9px] font-black uppercase tracking-wide text-[#36606F] hover:underline"
                        >
                          Ver pedido
                        </button>
                      ) : null}
                    </li>
                  )
                }

                const e = row.encargo
                return (
                  <li key={`enc-${e.id}`}>
                    <button
                      type="button"
                      onClick={() => onViewEncargoOrder(e.id)}
                      className="min-h-12 w-full py-3 text-left grid grid-cols-[3.5rem_1fr] gap-2 items-center hover:bg-zinc-50 active:bg-zinc-100/80 transition rounded-lg"
                    >
                      <span className="text-[12px] font-mono font-bold text-[#36606F]">{row.time}</span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-bold text-zinc-800 truncate">{e.name}</span>
                        {e.guest_count != null && e.guest_count > 0 ? (
                          <span className="block text-[10px] font-semibold text-zinc-500">
                            {e.guest_count} pers.
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-100 bg-white px-4 py-3">
          <button
            type="button"
            onClick={onPlusPedido}
            disabled={plusPedidoBusy}
            className="min-h-12 w-full flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#36606F] hover:bg-[#36606F]/5 active:bg-[#36606F]/10 rounded-xl transition-colors disabled:opacity-50"
          >
            {plusPedidoBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            )}
            Pedido
          </button>
        </div>
      </div>
    </div>
  )
}

export function CreateEncargoQuickModal({
  dayYmd,
  defaultTime,
  defaultGuestCount,
  busy,
  onClose,
  onSubmit,
}: {
  dayYmd: string
  defaultTime?: string
  defaultGuestCount?: number
  busy?: boolean
  onClose: () => void
  onSubmit: (data: { contact_name: string; event_time: string; guest_count: number }) => void
}) {
  const [contactName, setContactName] = useState('')
  const [eventTime, setEventTime] = useState(defaultTime ?? '21:00')
  const [guestCount, setGuestCount] = useState(String(defaultGuestCount ?? 20))

  useModalUsageTracking({
    open: true,
    usageId: 'reservas-create-encargo',
    usageLabel: 'Nuevo encargo',
  })

  const canSubmit = contactName.trim().length >= 2 && eventTime.trim() && guestCount.trim() && !busy

  return (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
      role="presentation"
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm max-h-[calc(100dvh-2rem)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">Nuevo encargo</p>
        <p className="mt-1 text-xs font-semibold text-zinc-600 capitalize">
          {format(parseLocalSafe(dayYmd), 'EEEE d MMM', { locale: es })}
        </p>
        <label className="mt-4 block">
          <span className="text-[10px] font-black uppercase text-zinc-500">Contacto</span>
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold"
            placeholder="Nombre del grupo"
            autoComplete="name"
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] font-black uppercase text-zinc-500">Hora</span>
            <input
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase text-zinc-500">Pers.</span>
            <input
              inputMode="numeric"
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold"
            />
          </label>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-12 rounded-xl bg-zinc-100 text-[11px] font-black uppercase text-zinc-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                contact_name: contactName.trim(),
                event_time: eventTime.slice(0, 5),
                guest_count: Number(guestCount) || 1,
              })
            }
            className="min-h-12 rounded-xl bg-emerald-600 text-[11px] font-black uppercase text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  )
}