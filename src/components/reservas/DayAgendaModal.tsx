'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Loader2, Plus, X } from 'lucide-react'

import { buildDayAgendaListRows } from '@/lib/encargo-staff-helpers'
import { cn } from '@/lib/utils'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'
import type { EncargoRow } from '@/lib/reservas-encargos-calendar'
import { timeShortHm } from '@/lib/reservas-encargos-calendar'

type EncargoReservationOption = {
  id: string
  customer_name: string
  reservation_time: string
  pax: number
}

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
                            {e.guest_count} pax
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

const CLOSING_PETROL_FIELD =
  'box-border h-9 w-full min-w-0 max-w-full rounded-xl border border-[#36606F] bg-white px-2 text-center text-sm font-black text-zinc-800 outline-none transition-colors focus:bg-[#36606F]/5'

const CLOSING_PETROL_TIME_FIELD = cn(
  CLOSING_PETROL_FIELD,
  'appearance-none',
  '[&::-webkit-date-and-time-value]:min-w-0 [&::-webkit-date-and-time-value]:text-center',
  '[&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit]:text-center',
  '[&::-webkit-datetime-edit-fields-wrapper]:p-0',
  '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0',
  '[&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full',
  '[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:bg-transparent',
)

const ENCARGO_FIELD_COL = 'w-[8.75rem] sm:w-[9.5rem]'

const ENCARGO_ROW_TITLE =
  'text-[10px] font-black uppercase leading-tight text-[#36606F] sm:text-xs'

function EncargoFormStepRow({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-[40px] grid-cols-[7.25rem_1fr] items-center gap-x-2 sm:grid-cols-[8.25rem_1fr] sm:gap-x-3">
      <span className={ENCARGO_ROW_TITLE}>{title}</span>
      <div className="flex min-w-0 items-center justify-center">
        <div className={cn(ENCARGO_FIELD_COL, 'relative shrink-0')}>{children}</div>
      </div>
    </div>
  )
}

export function CreateEncargoQuickModal({
  dayYmd,
  availableReservations = [],
  defaultTime,
  defaultGuestCount,
  busy,
  onClose,
  onSubmit,
}: {
  dayYmd: string
  availableReservations?: EncargoReservationOption[]
  defaultTime?: string
  defaultGuestCount?: number
  busy?: boolean
  onClose: () => void
  onSubmit: (data: {
    contact_name: string
    event_time: string
    guest_count: number
    reservation_id: string | null
  }) => void
}) {
  const [contactName, setContactName] = useState('')
  const [linkedReservationId, setLinkedReservationId] = useState('')
  const [eventTime, setEventTime] = useState(defaultTime ?? '21:00')
  const [guestCount, setGuestCount] = useState(defaultGuestCount ?? 20)

  const linkedReservation = useMemo(
    () => availableReservations.find((r) => r.id === linkedReservationId) ?? null,
    [availableReservations, linkedReservationId]
  )

  useEffect(() => {
    if (!linkedReservation) return
    setEventTime(timeShortHm(linkedReservation.reservation_time))
    setGuestCount(Math.max(1, linkedReservation.pax || 1))
  }, [linkedReservation])

  useModalUsageTracking({
    open: true,
    usageId: 'reservas-create-encargo',
    usageLabel: 'Nuevo encargo',
  })

  const resolvedName = linkedReservation?.customer_name.trim() ?? contactName.trim()
  const canSubmit =
    resolvedName.length >= 2 &&
    eventTime.trim().length >= 4 &&
    guestCount >= 1 &&
    !busy

  return (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
      role="presentation"
    >
      <div
        className={cn(
          'bg-white w-full max-w-sm flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 rounded-2xl',
          'max-h-[calc(100dvh-2rem)] shadow-2xl shadow-black/20 border border-white/10'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#36606F] px-4 py-3 flex items-center justify-between text-white shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Nuevo pedido</p>
            <h3 className="text-[12px] sm:text-sm font-black uppercase tracking-wide capitalize truncate">
              {format(parseLocalSafe(dayYmd), "EEEE d 'de' MMMM", { locale: es })}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-10 h-10 flex items-center justify-center bg-rose-500 rounded-xl hover:bg-rose-600 transition-all text-white active:scale-90 shadow-md shadow-rose-900/20 min-h-12 min-w-12 shrink-0 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={3} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5 space-y-5">
          {availableReservations.length > 0 ? (
            <EncargoFormStepRow title="Enlazar a reserva">
              <select
                value={linkedReservationId}
                onChange={(e) => setLinkedReservationId(e.target.value)}
                disabled={busy}
                className={cn(CLOSING_PETROL_FIELD, 'text-center')}
              >
                <option value=""> </option>
                {availableReservations.map((r) => (
                  <option key={r.id} value={r.id}>
                    {timeShortHm(r.reservation_time)} · {r.customer_name} · {r.pax} pax
                  </option>
                ))}
              </select>
            </EncargoFormStepRow>
          ) : null}

          {!linkedReservation ? (
            <EncargoFormStepRow title="Nombre">
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                disabled={busy}
                className={CLOSING_PETROL_FIELD}
                placeholder=" "
                autoComplete="name"
              />
            </EncargoFormStepRow>
          ) : null}

          <EncargoFormStepRow title="Hora">
            <input
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              disabled={busy}
              className={CLOSING_PETROL_TIME_FIELD}
            />
          </EncargoFormStepRow>

          <EncargoFormStepRow title="PAX">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={guestCount || ''}
              onChange={(e) => setGuestCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              disabled={busy}
              className={CLOSING_PETROL_FIELD}
            />
          </EncargoFormStepRow>
        </div>

        <div className="shrink-0 border-t border-zinc-100 bg-white px-4 py-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-12 rounded-xl bg-zinc-100 text-[11px] font-black uppercase text-zinc-700 active:scale-[0.98] transition-transform"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                contact_name: resolvedName,
                event_time: eventTime.slice(0, 5),
                guest_count: guestCount,
                reservation_id: linkedReservation?.id ?? null,
              })
            }
            className="min-h-12 rounded-xl bg-emerald-500 text-[11px] font-black uppercase text-white hover:bg-emerald-600 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  )
}