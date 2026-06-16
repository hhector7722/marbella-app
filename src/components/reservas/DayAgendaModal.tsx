'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Download, Loader2, Plus, X } from 'lucide-react'

import { EventOrdersProductMatrix } from '@/components/eventos/EventOrdersProductMatrix'
import type { EventOrderMatrixRow } from '@/lib/event-orders-matrix'
import { cn } from '@/lib/utils'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'
import type { EncargoOrderRow, EncargoRow } from '@/lib/reservas-encargos-calendar'
import { timeShortHm } from '@/lib/reservas-encargos-calendar'

type Reservation = {
  id: string
  customer_name: string
  reservation_time: string
  pax: number
  status: string
}

type AgendaTab = 'reservas' | 'encargos' | 'pedidos'

function parseLocalSafe(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function statusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Pendiente'
    case 'confirmed':
      return 'Confirmada'
    case 'rejected':
      return 'Rechazada'
    case 'cancelled':
      return 'Cancelada'
    default:
      return status
  }
}

function orderStatusLabel(status: EncargoOrderRow['status']) {
  switch (status) {
    case 'pending':
      return 'Pendiente'
    case 'confirmed':
      return 'Confirmado'
    case 'cancelled':
      return 'Cancelado'
  }
}

function statusTone(status: string) {
  switch (status) {
    case 'pending':
      return 'text-amber-700'
    case 'confirmed':
      return 'text-emerald-700'
    case 'rejected':
      return 'text-rose-700'
    case 'cancelled':
      return 'text-zinc-500'
    default:
      return 'text-zinc-500'
  }
}

export function DayAgendaModal({
  dayYmd,
  reservations,
  encargos,
  orders,
  canManageOrders,
  orderStatusBusyId,
  plusPedidoBusy,
  onClose,
  onSelectReservation,
  onOpenEncargo,
  onPlusPedido,
  onOrderStatusChange,
}: {
  dayYmd: string
  reservations: Reservation[]
  encargos: EncargoRow[]
  orders: EncargoOrderRow[]
  canManageOrders?: boolean
  orderStatusBusyId?: string | null
  plusPedidoBusy?: boolean
  onClose: () => void
  onSelectReservation: (r: Reservation) => void
  onOpenEncargo: (encargoId: string) => void
  onPlusPedido: () => void
  onOrderStatusChange?: (orderId: string, status: EncargoOrderRow['status']) => void
}) {
  const defaultTab: AgendaTab = useMemo(() => {
    if (reservations.length > 0) return 'reservas'
    if (encargos.length > 0) return 'encargos'
    if (orders.length > 0) return 'pedidos'
    return 'reservas'
  }, [reservations.length, encargos.length, orders.length])

  const [tab, setTab] = useState<AgendaTab>(defaultTab)

  useModalUsageTracking({
    open: true,
    usageId: 'reservas-day-agenda',
    usageLabel: 'Agenda del día',
  })

  const matrixOrders: EventOrderMatrixRow[] = orders.map((o) => {
    const ev = encargos.find((e) => e.id === o.event_id)
    return {
      id: o.id,
      responsible_name: o.responsible_name,
      items: o.items,
      event_id: o.event_id,
      event_name: ev?.name,
      event_date: dayYmd,
    }
  })

  const encargosWithOrders = encargos.filter((e) =>
    orders.some((o) => o.event_id === e.id)
  )

  const tabs: { id: AgendaTab; label: string; count: number }[] = [
    { id: 'reservas', label: 'Reservas', count: reservations.length },
    { id: 'encargos', label: 'Encargos', count: encargos.length },
    { id: 'pedidos', label: 'Pedidos', count: orders.length },
  ]

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

        <div
          className="shrink-0 flex border-b border-zinc-100 bg-zinc-50/80"
          role="tablist"
          aria-label="Secciones del día"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 min-h-12 px-2 text-[10px] font-black uppercase tracking-wider transition-colors',
                tab === t.id
                  ? 'text-[#36606F] border-b-2 border-[#36606F] bg-white'
                  : 'text-zinc-500 hover:text-zinc-700'
              )}
            >
              {t.label}
              {t.count > 0 ? (
                <span className="ml-1 tabular-nums">({t.count})</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === 'reservas' ? (
            <div role="tabpanel" className="px-4 py-2">
              {reservations.length === 0 ? (
                <p className="py-8 text-center text-xs font-semibold text-zinc-500">Sin reservas este día.</p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {reservations.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => onSelectReservation(r)}
                        className="min-h-12 w-full py-3 text-left grid grid-cols-[3.5rem_1fr_auto] gap-2 items-center hover:bg-zinc-50 active:bg-zinc-100/80 transition"
                      >
                        <span className="text-[12px] font-mono font-bold text-zinc-700">
                          {timeShortHm(r.reservation_time)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-bold text-zinc-800 truncate">
                            {r.customer_name}
                          </span>
                          <span className="block text-[10px] font-semibold text-zinc-500">{r.pax} pax</span>
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-[9px] font-black uppercase text-right',
                            statusTone(r.status)
                          )}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === 'encargos' ? (
            <div role="tabpanel" className="px-4 py-2">
              {encargos.length === 0 ? (
                <p className="py-8 text-center text-xs font-semibold text-zinc-500">Sin encargos este día.</p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {encargos.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => onOpenEncargo(e.id)}
                        className="min-h-12 w-full py-3 text-left grid grid-cols-[3.5rem_1fr_auto] gap-2 items-start hover:bg-zinc-50 active:bg-zinc-100/80 transition"
                      >
                        <span className="text-[12px] font-mono font-bold text-[#36606F] pt-0.5">
                          {timeShortHm(e.event_time)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-bold text-zinc-800 truncate">{e.name}</span>
                          {e.guest_count != null && e.guest_count > 0 ? (
                            <span className="block text-[10px] font-semibold text-zinc-500">
                              {e.guest_count} pers.
                            </span>
                          ) : null}
                          {e.reservation_id ? (
                            <span className="block text-[10px] font-semibold text-[#36606F]">Vinculado a reserva</span>
                          ) : null}
                        </span>
                        {!e.is_active ? (
                          <span className="shrink-0 text-[9px] font-black uppercase text-zinc-500">Inactivo</span>
                        ) : (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-[#36606F] mt-1.5" aria-hidden />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === 'pedidos' ? (
            <div role="tabpanel" className="px-4 py-3 flex flex-col gap-4">
              {orders.length === 0 ? (
                <p className="py-8 text-center text-xs font-semibold text-zinc-500">Sin pedidos este día.</p>
              ) : (
                <>
                  <EventOrdersProductMatrix orders={matrixOrders} />

                  {canManageOrders ? (
                    <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
                      {orders.map((o) => {
                        const ev = encargos.find((e) => e.id === o.event_id)
                        const busy = orderStatusBusyId === o.id
                        return (
                          <li
                            key={o.id}
                            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="text-[12px] font-bold text-zinc-800 truncate">{o.responsible_name}</p>
                              {ev ? (
                                <p className="text-[10px] font-medium text-zinc-500 truncate">
                                  {timeShortHm(ev.event_time)} · {ev.name}
                                </p>
                              ) : null}
                            </div>
                            <select
                              value={o.status}
                              disabled={busy || !onOrderStatusChange}
                              onChange={(e) =>
                                onOrderStatusChange?.(o.id, e.target.value as EncargoOrderRow['status'])
                              }
                              className="min-h-12 shrink-0 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-black uppercase tracking-wide text-zinc-800 disabled:opacity-50"
                              aria-label={`Estado pedido ${o.responsible_name}`}
                            >
                              <option value="pending">{orderStatusLabel('pending')}</option>
                              <option value="confirmed">{orderStatusLabel('confirmed')}</option>
                              <option value="cancelled">{orderStatusLabel('cancelled')}</option>
                            </select>
                          </li>
                        )
                      })}
                    </ul>
                  ) : null}

                  {canManageOrders && encargosWithOrders.length > 0 ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1 border-t border-zinc-100">
                      {encargosWithOrders.map((e) => (
                        <a
                          key={e.id}
                          href={`/api/eventos/${e.id}/export`}
                          className="inline-flex min-h-12 items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#36606F] hover:underline"
                        >
                          <Download className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                          CSV · {e.name}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
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
        className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl"
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
