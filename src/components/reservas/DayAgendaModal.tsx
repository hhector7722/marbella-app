'use client'

import { useState } from 'react'
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

function reservationLineWithName(r: Reservation) {
  return `${timeShortHm(r.reservation_time)} - ${r.pax} pax - ${r.customer_name}`
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

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        className="bg-white rounded-[2rem] w-full max-w-lg max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
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
            onClick={onPlusPedido}
            disabled={plusPedidoBusy}
            className="shrink-0 min-h-12 px-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 text-white hover:text-white/75 disabled:opacity-50 transition-colors"
          >
            {plusPedidoBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            )}
            Pedido
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10 active:scale-95 transition shrink-0"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
          <section>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#36606F] mb-1">Reservas</p>
            {reservations.length === 0 ? (
              <p className="text-xs font-semibold text-zinc-500 py-2">Sin reservas este día.</p>
            ) : (
              <div className="divide-y divide-zinc-100 border-t border-zinc-100">
                {reservations.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onSelectReservation(r)}
                    className="min-h-12 w-full py-3 text-left flex items-center justify-between gap-3 hover:bg-zinc-50 active:bg-zinc-100/80 transition"
                  >
                    <span className="text-[13px] font-bold text-zinc-800 truncate">
                      {reservationLineWithName(r)}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-[9px] font-black uppercase',
                        r.status === 'confirmed'
                          ? 'text-emerald-700'
                          : r.status === 'pending'
                            ? 'text-amber-700'
                            : 'text-rose-700'
                      )}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#36606F] mb-1">Encargos</p>
            {encargos.length === 0 ? (
              <p className="text-xs font-semibold text-zinc-500 py-2">Sin encargos este día.</p>
            ) : (
              <div className="divide-y divide-zinc-100 border-t border-zinc-100">
                {encargos.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpenEncargo(e.id)}
                    className="min-h-12 w-full py-3 text-left hover:bg-zinc-50 active:bg-zinc-100/80 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold text-zinc-800 truncate">
                        {timeShortHm(e.event_time)} · {e.name}
                      </span>
                      {!e.is_active ? (
                        <span className="shrink-0 text-[9px] font-black uppercase text-zinc-500">Inactivo</span>
                      ) : null}
                    </div>
                    {e.reservation_id ? (
                      <p className="mt-0.5 text-[10px] font-semibold text-[#36606F]">Vinculado a reserva</p>
                    ) : null}
                    {e.guest_count != null && e.guest_count > 0 ? (
                      <p className="mt-0.5 text-[10px] font-medium text-zinc-500">{e.guest_count} pers.</p>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </section>

          {orders.length > 0 ? (
            <section>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#36606F] mb-1">Pedidos</p>
              <EventOrdersProductMatrix orders={matrixOrders} />

              {canManageOrders ? (
                <div className="mt-3 border-t border-zinc-100 divide-y divide-zinc-100">
                  {orders.map((o) => {
                    const ev = encargos.find((e) => e.id === o.event_id)
                    const busy = orderStatusBusyId === o.id
                    return (
                      <div
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
                          className="min-h-12 shrink-0 border-0 border-b border-zinc-200 bg-transparent px-1 text-[11px] font-black uppercase tracking-wide text-zinc-800 disabled:opacity-50"
                          aria-label={`Estado pedido ${o.responsible_name}`}
                        >
                          <option value="pending">{orderStatusLabel('pending')}</option>
                          <option value="confirmed">{orderStatusLabel('confirmed')}</option>
                          <option value="cancelled">{orderStatusLabel('cancelled')}</option>
                        </select>
                      </div>
                    )
                  })}
                </div>
              ) : null}

              {canManageOrders && encargosWithOrders.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
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
            </section>
          ) : null}
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
