'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { buildDayAgendaListRows } from '@/lib/encargo-staff-helpers'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
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
  const rows = useMemo(
    () => buildDayAgendaListRows(reservations, encargos),
    [reservations, encargos]
  )

  return (
    <Modal
      open
      onClose={onClose}
      variant="standard"
      layer="base"
      instance="reservas-day-agenda"
      title={format(parseLocalSafe(dayYmd), 'EEEE d MMM', { locale: es })}
      subtitle="Agenda del día"
      headerTone="petroleum"
      wrapperClassName="max-w-[min(32rem,calc(100vw-2rem))]"
      footer={
        <Button
          type="button"
          variant="tertiary"
          instance="reservas-day-agenda-pedido"
          onClick={onPlusPedido}
          loading={plusPedidoBusy}
          loadingLabel="Pedido"
        >
          Pedido
        </Button>
      }
    >
      <div className="flex-1 overflow-y-auto min-h-0 py-2">
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
                      <Button
                        type="button"
                        variant="tertiary"
                        instance={`day-agenda-view-order-${row.linkedEncargo.id}`}
                        onClick={() => onViewEncargoOrder(row.linkedEncargo!.id)}
                        className="shrink-0 self-center"
                      >
                        Ver pedido
                      </Button>
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
    </Modal>
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

  const resolvedName = linkedReservation?.customer_name.trim() ?? contactName.trim()
  const canSubmit =
    resolvedName.length >= 2 &&
    eventTime.trim().length >= 4 &&
    guestCount >= 1 &&
    !busy

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose() }}
      variant="compact"
      layer="derived"
      instance="reservas-create-encargo"
      parentInstance="reservas-day-agenda"
      title={format(parseLocalSafe(dayYmd), "EEEE d 'de' MMMM", { locale: es })}
      subtitle="Nuevo pedido"
      headerTone="petroleum"
      closeOnBackdrop={!busy}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            instance="reservas-encargo-create-cancel"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            instance="reservas-encargo-create-continue"
            disabled={!canSubmit}
            loading={busy}
            loadingLabel="Continuar"
            onClick={() =>
              onSubmit({
                contact_name: resolvedName,
                event_time: eventTime.slice(0, 5),
                guest_count: guestCount,
                reservation_id: linkedReservation?.id ?? null,
              })
            }
          >
            Continuar
          </Button>
        </div>
      }
    >
      <div className="flex-1 overflow-y-auto min-h-0 space-y-5">
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
    </Modal>
  )
}