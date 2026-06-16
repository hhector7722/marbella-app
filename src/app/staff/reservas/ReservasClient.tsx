'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash2,
  Loader2,
  Phone,
  Plus,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { createEncargoAction, setEventOrderStatusAction } from '@/app/dashboard/eventos/actions'
import { canManageEventos } from '@/app/dashboard/eventos/roles'
import {
  CreateEncargoQuickModal,
  DayAgendaModal,
} from '@/components/reservas/DayAgendaModal'

import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { cn } from '@/lib/utils'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'
import { useTrackModalApply } from '@/hooks/useTrackModalApply'
import { formatYmdShort, reservationApplySummary } from '@/lib/usage/modal-apply'
import { createClient } from '@/utils/supabase/client'
import type { EncargoOrderRow, EncargoRow } from '@/lib/reservas-encargos-calendar'
import {
  encargosForReservation,
  groupEncargosByDate,
  ordersForDay,
  timeShortHm,
} from '@/lib/reservas-encargos-calendar'

type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'rejected'

type Reservation = {
  id: string
  customer_name: string
  customer_phone: string
  reservation_date: string
  reservation_time: string
  pax: number
  status: ReservationStatus
  notes: string | null
  created_at: string
}

type ActionKind = 'confirm' | 'reject' | 'delete'

type GestionarReservasResult = {
  ok?: boolean
  id?: string
  status?: string
  deleted?: boolean
  soft_deleted?: boolean
  error?: string
}

function parseLocalSafe(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isToday(day: Date, now = new Date()): boolean {
  return (
    day.getFullYear() === now.getFullYear() &&
    day.getMonth() === now.getMonth() &&
    day.getDate() === now.getDate()
  )
}

function timeShort(t: string) {
  if (!t) return '--:--'
  return t.length >= 5 ? t.slice(0, 5) : t
}

function statusLabel(status: ReservationStatus) {
  switch (status) {
    case 'pending':
      return 'Pendiente'
    case 'confirmed':
      return 'Confirmada'
    case 'rejected':
      return 'Rechazada'
    case 'cancelled':
      return 'Cancelada'
  }
}

function statusTone(status: ReservationStatus) {
  switch (status) {
    case 'pending':
      return 'text-amber-700'
    case 'confirmed':
      return 'text-emerald-700'
    case 'rejected':
      return 'text-rose-700'
    case 'cancelled':
      return 'text-zinc-500'
  }
}

function formatPhone(phone: string) {
  const cleaned = phone.replace(/\D/g, '')
  return cleaned.length === 9 ? '34' + cleaned : cleaned
}

function formatReservationDateLabel(ymd: string) {
  const parts = ymd.slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd
  const [y, m, d] = parts
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function getMessage(name: string, dateYmd: string, time: string) {
  const dateLabel = formatReservationDateLabel(dateYmd)
  return encodeURIComponent(
    `Hola ${name}, te confirmamos tu reserva en Bar La Marbella para el ${dateLabel} a las ${time.slice(0, 5)}. ¡Te esperamos!`
  )
}

function reservationLineWithName(r: Reservation) {
  return `${timeShort(r.reservation_time)} - ${r.pax} pax - ${r.customer_name}`
}

function getReservationDateTime(r: Reservation): Date {
  const [y, m, d] = r.reservation_date.slice(0, 10).split('-').map(Number)
  const [hh, mm] = timeShort(r.reservation_time).split(':').map(Number)
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0)
}

function isReservationPast(r: Reservation, now = new Date()) {
  return getReservationDateTime(r) < now
}

function reservationDotClass(r: Reservation) {
  if (isReservationPast(r)) return 'bg-gray-400'
  if (r.status === 'rejected') return 'bg-red-500'
  return 'bg-green-500'
}

function EncargoCalendarEntry({ e }: { e: EncargoRow }) {
  return (
    <div className="flex flex-col min-w-0 w-full leading-tight gap-0.5">
      <div className="flex items-center gap-1 min-w-0">
        <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#36606F]" aria-hidden />
        <span className="text-[9px] font-mono leading-none whitespace-nowrap text-[#36606F]">
          {timeShortHm(e.event_time)}
        </span>
        <span className="text-[8px] font-semibold leading-none truncate text-[#36606F] min-w-0">
          {e.name}
        </span>
      </div>
    </div>
  )
}

function ReservationCalendarEntry({ r }: { r: Reservation }) {
  const isPast = isReservationPast(r)
  return (
    <div className="flex flex-col min-w-0 w-full leading-tight gap-0.5">
      <div className="flex items-center gap-1 min-w-0">
        <div
          className={cn('w-1.5 h-1.5 rounded-full shrink-0', reservationDotClass(r))}
          aria-hidden
        />
        <span
          className={cn(
            'text-[9px] font-mono leading-none whitespace-nowrap',
            isPast ? 'text-zinc-400' : 'text-zinc-700'
          )}
        >
          {timeShort(r.reservation_time)}
        </span>
        <span
          className={cn(
            'text-[8px] font-semibold leading-none truncate min-w-0',
            isPast ? 'text-zinc-400' : 'text-zinc-800'
          )}
        >
          {r.customer_name}
        </span>
      </div>
      {r.pax > 0 ? (
        <span className={cn('text-[8px] font-medium leading-none ml-[10px]', isPast ? 'text-zinc-400' : 'text-zinc-500')}>
          {r.pax} pax
        </span>
      ) : null}
    </div>
  )
}

function groupByDate(rows: Reservation[]): Record<string, Reservation[]> {
  const map: Record<string, Reservation[]> = {}
  for (const r of rows) {
    const key = r.reservation_date.slice(0, 10)
    if (!map[key]) map[key] = []
    map[key].push(r)
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => {
      const ta = timeShort(a.reservation_time)
      const tb = timeShort(b.reservation_time)
      if (ta !== tb) return ta.localeCompare(tb)
      return a.created_at.localeCompare(b.created_at)
    })
  }
  return map
}

function ReservationDetailModal({
  reservation,
  linkedEncargos,
  actionBusy,
  plusPedidoBusy,
  onClose,
  onAction,
  onPlusPedido,
  onOpenEncargo,
}: {
  reservation: Reservation
  linkedEncargos: EncargoRow[]
  actionBusy: ActionKind | null
  plusPedidoBusy: boolean
  onClose: () => void
  onAction: (action: ActionKind) => void
  onPlusPedido: () => void
  onOpenEncargo: (encargoId: string) => void
}) {
  const isBusy = Boolean(actionBusy)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  useEffect(() => {
    setDeleteConfirmOpen(false)
  }, [reservation.id])

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        className="bg-white rounded-[2rem] w-full max-w-md max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#36606F] px-4 py-3 text-white shrink-0 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Reserva</p>
            <h3 className="text-base font-black capitalize truncate">
              {formatReservationDateLabel(reservation.reservation_date)}
            </h3>
          </div>
          <button
            type="button"
            onClick={onPlusPedido}
            disabled={plusPedidoBusy || isBusy}
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
            className="min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10 active:scale-95 transition"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-100">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-black tracking-tight text-zinc-900">
                  {timeShort(reservation.reservation_time)}
                </div>
                <div className="text-[12px] font-black text-zinc-500">·</div>
                <div className="text-xl font-black tracking-tight text-zinc-900">{reservation.pax}</div>
                <div className="text-[11px] font-black uppercase tracking-wide text-zinc-500">PAX</div>
              </div>
              <div className="mt-1 truncate text-[13px] font-black text-zinc-800">
                {reservation.customer_name}
              </div>
            </div>
            <span
              className={cn(
                'shrink-0 text-[10px] font-black uppercase tracking-wide',
                statusTone(reservation.status)
              )}
            >
              {statusLabel(reservation.status)}
            </span>
          </div>

          <a
            href={`https://wa.me/${formatPhone(reservation.customer_phone)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-12 flex items-center gap-2 py-2 border-b border-zinc-100 text-zinc-700 font-bold text-[12px] hover:text-zinc-900 transition"
          >
            <Phone className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2.5} />
            <span className="truncate">{reservation.customer_phone}</span>
          </a>

          {reservation.notes ? (
            <div className="py-2 border-b border-zinc-100">
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Notas</div>
              <div className="mt-1 text-[12px] font-medium text-zinc-800 whitespace-pre-wrap">
                {reservation.notes}
              </div>
            </div>
          ) : null}

          {linkedEncargos.length > 0 ? (
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#36606F] mb-1">Encargos</div>
              <div className="divide-y divide-zinc-100 border-t border-zinc-100">
                {linkedEncargos.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpenEncargo(e.id)}
                    className="min-h-12 w-full py-3 text-left text-[12px] font-bold text-zinc-800 hover:bg-zinc-50 active:bg-zinc-100/80 transition"
                  >
                    {timeShortHm(e.event_time)} · {e.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {deleteConfirmOpen ? (
            <div className="flex flex-col gap-3 shrink-0 mt-auto pt-3 border-t border-zinc-100">
              <p className="text-[13px] font-black text-rose-900 text-center">
                ¿Eliminar la reserva de {reservation.customer_name}?
              </p>
              <p className="text-[11px] font-medium text-zinc-500 text-center">
                Esta acción no se puede deshacer.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={isBusy}
                  className={cn(
                    'min-h-12 font-black text-[11px] uppercase tracking-wide',
                    'text-zinc-700 hover:bg-zinc-50 active:scale-95 transition',
                    'disabled:opacity-60 disabled:active:scale-100'
                  )}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => onAction('delete')}
                  disabled={isBusy}
                  className={cn(
                    'min-h-12 font-black text-[11px] uppercase tracking-wide',
                    'text-rose-600 hover:bg-rose-50 active:scale-95 transition',
                    'disabled:opacity-60 disabled:active:scale-100'
                  )}
                >
                  <span className="inline-flex items-center justify-center gap-1">
                    {actionBusy === 'delete' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CircleSlash2 className="h-4 w-4" strokeWidth={2.5} />
                    )}
                    Sí, eliminar
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 shrink-0 mt-auto pt-3 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => onAction('confirm')}
                disabled={isBusy}
                className={cn(
                  'min-h-12 font-black text-[11px] uppercase tracking-wide',
                  'text-emerald-700 hover:bg-emerald-50 active:scale-95 transition',
                  'disabled:opacity-60 disabled:active:scale-100'
                )}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  {actionBusy === 'confirm' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
                  )}
                  Confirmar
                </span>
              </button>
              <button
                type="button"
                onClick={() => onAction('reject')}
                disabled={isBusy}
                className={cn(
                  'min-h-12 font-black text-[11px] uppercase tracking-wide',
                  'text-rose-600 hover:bg-rose-50 active:scale-95 transition',
                  'disabled:opacity-60 disabled:active:scale-100'
                )}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  {actionBusy === 'reject' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" strokeWidth={2.5} />
                  )}
                  Rechazar
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={isBusy}
                className={cn(
                  'min-h-12 font-black text-[11px] uppercase tracking-wide',
                  'text-zinc-600 hover:bg-zinc-50 active:scale-95 transition',
                  'disabled:opacity-60 disabled:active:scale-100'
                )}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  <CircleSlash2 className="h-4 w-4" strokeWidth={2.5} />
                  Eliminar
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ReservasClient() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const searchParams = useSearchParams()
  const deepLinkHandledRef = useRef<string | null>(null)
  const [isPendingEncargo, startEncargoTransition] = useTransition()

  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [loading, setLoading] = useState(true)
  const [rpcError, setRpcError] = useState<string | null>(null)
  const [byDate, setByDate] = useState<Record<string, Reservation[]>>({})
  const [encargosByDate, setEncargosByDate] = useState<Record<string, EncargoRow[]>>({})
  const [allEncargos, setAllEncargos] = useState<EncargoRow[]>([])
  const [ordersByEventId, setOrdersByEventId] = useState<Record<string, EncargoOrderRow[]>>({})
  const [userRole, setUserRole] = useState<string | null>(null)

  const [listModalDay, setListModalDay] = useState<string | null>(null)
  const [createEncargoDay, setCreateEncargoDay] = useState<string | null>(null)
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)
  const [actionBusy, setActionBusy] = useState<Record<string, ActionKind | null>>({})
  const [orderStatusBusyId, setOrderStatusBusyId] = useState<string | null>(null)

  useModalUsageTracking({
    open: listModalDay !== null,
    usageId: 'reservas-day-agenda',
    usageLabel: 'Agenda del día',
  })
  useModalUsageTracking({
    open: selectedReservation !== null,
    usageId: 'reservas-detail',
    usageLabel: 'Detalle de reserva',
  })

  const trackReservasDayList = useTrackModalApply('reservas-day-agenda', 'Agenda del día')
  const trackReservasPlusPedido = useTrackModalApply('reservas-plus-pedido', 'Crear encargo')
  const trackReservasDetail = useTrackModalApply('reservas-detail', 'Detalle de reserva')

  const canManageOrders = canManageEventos(userRole)

  const fetchSeqRef = useRef(0)

  const removeReservationFromState = useCallback((id: string) => {
    setByDate((prev) => {
      const next: Record<string, Reservation[]> = {}
      for (const [key, list] of Object.entries(prev)) {
        const filtered = list.filter((r) => r.id !== id)
        if (filtered.length > 0) next[key] = filtered
      }
      return next
    })
  }, [])

  const monthStart = useMemo(() => format(startOfMonth(viewMonth), 'yyyy-MM-dd'), [viewMonth])
  const monthEnd = useMemo(() => format(endOfMonth(viewMonth), 'yyyy-MM-dd'), [viewMonth])

  const calendarDays = useMemo(() => {
    const startVisible = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 })
    const endVisible = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start: startVisible, end: endVisible })
  }, [viewMonth])

  const calendarWeeks = useMemo(() => {
    const weeks: Date[][] = []
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7))
    }
    return weeks
  }, [calendarDays])

  const fetchMonthData = useCallback(async () => {
    const seq = ++fetchSeqRef.current
    setRpcError(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle()
        if (seq === fetchSeqRef.current) {
          setUserRole((profile as { role?: string } | null)?.role ?? null)
        }
      }

      const [resResult, evResult] = await Promise.all([
        supabase
          .from('reservations')
          .select(
            'id, customer_name, customer_phone, reservation_date, reservation_time, pax, status, notes, created_at'
          )
          .gte('reservation_date', monthStart)
          .lte('reservation_date', monthEnd)
          .neq('status', 'cancelled')
          .order('reservation_time', { ascending: true }),
        supabase
          .from('events')
          .select('id, slug, name, event_date, event_time, guest_count, reservation_id, is_active')
          .gte('event_date', monthStart)
          .lte('event_date', monthEnd)
          .order('event_time', { ascending: true }),
      ])

      if (resResult.error) throw resResult.error
      if (evResult.error) throw evResult.error

      const encargos = (evResult.data ?? []) as EncargoRow[]
      const eventIds = encargos.map((e) => e.id)

      let ordersByEvent: Record<string, EncargoOrderRow[]> = {}
      if (eventIds.length > 0) {
        const { data: orders, error: ordersErr } = await supabase
          .from('event_orders')
          .select('id, event_id, responsible_name, items, status, created_at')
          .in('event_id', eventIds)
          .order('created_at', { ascending: false })

        if (ordersErr) throw ordersErr

        for (const row of (orders ?? []) as EncargoOrderRow[]) {
          const eid = String(row.event_id)
          if (!ordersByEvent[eid]) ordersByEvent[eid] = []
          ordersByEvent[eid].push(row)
        }
      }

      if (seq === fetchSeqRef.current) {
        setByDate(groupByDate((resResult.data ?? []) as Reservation[]))
        setAllEncargos(encargos)
        setEncargosByDate(groupEncargosByDate(encargos))
        setOrdersByEventId(ordersByEvent)
      }
    } catch (e) {
      const msg =
        (e as { message?: string })?.message ||
        (e as { error_description?: string })?.error_description ||
        (e as { details?: string })?.details ||
        'Error cargando agenda'
      if (seq === fetchSeqRef.current) {
        setByDate({})
        setAllEncargos([])
        setEncargosByDate({})
        setOrdersByEventId({})
        setRpcError(msg)
      }
      toast.error(msg)
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false)
    }
  }, [supabase, monthStart, monthEnd])

  async function softCancelReservation(id: string) {
    const { data, error } = await supabase.rpc('gestionar_reservas', {
      p_accion: 'cancel',
      p_datos: { id },
    })
    if (error) throw error
    const payload = data as GestionarReservasResult | null
    if (payload?.error) {
      throw new Error(typeof payload.error === 'string' ? payload.error : 'Error cancelando reserva')
    }
    return payload
  }

  async function mutateReservation(reserva: Reservation, action: ActionKind) {
    const { id } = reserva
    setActionBusy((s) => ({ ...s, [id]: action }))
    try {
      let data: GestionarReservasResult | null = null

      if (action === 'delete') {
        const result = await supabase.rpc('gestionar_reservas', {
          p_accion: 'delete',
          p_datos: { id },
        })
        if (result.error) {
          const errMsg = result.error.message ?? ''
          if (errMsg.includes('accion_invalida')) {
            await softCancelReservation(id)
            data = { soft_deleted: true }
          } else {
            throw result.error
          }
        } else {
          data = result.data as GestionarReservasResult
          if (data.error) {
            throw new Error(typeof data.error === 'string' ? data.error : 'Error eliminando reserva')
          }
        }
      } else {
        const result = await supabase.rpc('gestionar_reservas', {
          p_accion: action,
          p_datos: { id },
        })
        if (result.error) throw result.error
        data = result.data as GestionarReservasResult
        if (data.error) {
          throw new Error(typeof data.error === 'string' ? data.error : 'Error actualizando reserva')
        }
      }

      if (action === 'confirm') {
        toast.success('Reserva confirmada')
        window.open(
          `https://wa.me/${formatPhone(reserva.customer_phone)}?text=${getMessage(reserva.customer_name, reserva.reservation_date, reserva.reservation_time)}`,
          '_blank'
        )
        setSelectedReservation(null)
        setListModalDay(null)
        await fetchMonthData()
      } else if (action === 'reject') {
        toast.success('Reserva rechazada')
        setSelectedReservation(null)
        setListModalDay(null)
        await fetchMonthData()
      } else {
        toast.success(data?.soft_deleted ? 'Reserva cancelada' : 'Reserva eliminada')
        removeReservationFromState(id)
        setSelectedReservation(null)
        setListModalDay(null)
      }
    } catch (e) {
      const msg =
        (e as { message?: string })?.message ||
        (e as { error_description?: string })?.error_description ||
        (e as { details?: string })?.details ||
        'Error actualizando reserva'
      toast.error(msg)
    } finally {
      setActionBusy((s) => ({ ...s, [id]: null }))
    }
  }

  useEffect(() => {
    setLoading(true)
    void fetchMonthData()
  }, [fetchMonthData])

  useEffect(() => {
    const targetId = searchParams.get('id')?.trim()
    if (!targetId || deepLinkHandledRef.current === targetId) return

    const all = Object.values(byDate).flat()
    const found = all.find((r) => r.id === targetId)
    if (found) {
      deepLinkHandledRef.current = targetId
      const [y, m] = found.reservation_date.slice(0, 10).split('-').map(Number)
      if (!Number.isNaN(y) && !Number.isNaN(m)) {
        setViewMonth(new Date(y, m - 1, 1))
      }
      setSelectedReservation(found)
      return
    }

    if (loading) return

    void (async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select(
          'id, customer_name, customer_phone, reservation_date, reservation_time, pax, status, notes, created_at'
        )
        .eq('id', targetId)
        .neq('status', 'cancelled')
        .maybeSingle()

      if (error || !data) {
        toast.error('No se encontró la reserva de la notificación')
        return
      }

      deepLinkHandledRef.current = targetId
      const row = data as Reservation
      const [y, m] = row.reservation_date.slice(0, 10).split('-').map(Number)
      if (!Number.isNaN(y) && !Number.isNaN(m)) {
        setViewMonth(new Date(y, m - 1, 1))
      }
      setSelectedReservation(row)
    })()
  }, [searchParams, byDate, loading, supabase])

  useEffect(() => {
    function shouldRefetch(reservationDate: string | null | undefined) {
      if (!reservationDate) return true
      const d = reservationDate.slice(0, 10)
      return d >= monthStart && d <= monthEnd
    }

    function handleReservationChange(payload: { new?: { reservation_date?: string } }) {
      const rowDate = payload?.new?.reservation_date
      if (shouldRefetch(rowDate)) {
        void fetchMonthData()
      }
    }

    const channel = supabase
      .channel('public:reservations')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reservations' },
        (payload: { new?: { reservation_date?: string } }) => {
          toast.success('¡Nueva reserva desde la web!')
          handleReservationChange(payload)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'reservations' },
        (payload: { new?: { id?: string; status?: string; reservation_date?: string } }) => {
          if (payload?.new?.status === 'cancelled' && payload.new.id) {
            removeReservationFromState(payload.new.id)
          }
          handleReservationChange(payload)
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'reservations' },
        (payload: { old?: { id?: string; reservation_date?: string } }) => {
          const deletedId = payload?.old?.id
          if (deletedId) removeReservationFromState(deletedId)
          const rowDate = payload?.old?.reservation_date
          if (shouldRefetch(rowDate)) {
            void fetchMonthData()
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, monthStart, monthEnd, fetchMonthData, removeReservationFromState])

  const openEncargoEditor = useCallback(
    (eventId: string) => {
      router.push(`/staff/reservas/encargo/${eventId}`)
    },
    [router]
  )

  const submitCreateEncargo = useCallback(
    (
      dayYmd: string,
      data: { contact_name: string; event_time: string; guest_count: number },
      reservationId?: string | null
    ) => {
      startEncargoTransition(async () => {
        const res = await createEncargoAction({
          contact_name: data.contact_name,
          event_date: dayYmd,
          event_time: data.event_time,
          guest_count: data.guest_count,
          reservation_id: reservationId ?? null,
        })
        if (!res.success) {
          toast.error(res.message)
          return
        }
        trackReservasPlusPedido(data.contact_name)
        setCreateEncargoDay(null)
        setListModalDay(null)
        setSelectedReservation(null)
        toast.success('Encargo creado')
        openEncargoEditor(res.eventId)
      })
    },
    [openEncargoEditor, trackReservasPlusPedido]
  )

  const startEncargoFromReservation = useCallback(
    (reservation: Reservation) => {
      submitCreateEncargo(
        reservation.reservation_date.slice(0, 10),
        {
          contact_name: reservation.customer_name,
          event_time: timeShort(reservation.reservation_time),
          guest_count: Math.max(1, reservation.pax || 1),
        },
        reservation.id
      )
    },
    [submitCreateEncargo]
  )

  const handleOrderStatusChange = useCallback(
    async (orderId: string, status: EncargoOrderRow['status']) => {
      setOrderStatusBusyId(orderId)
      try {
        const res = await setEventOrderStatusAction({ orderId, status })
        if (!res.success) {
          toast.error(res.message)
          return
        }
        setOrdersByEventId((prev) => {
          const next: Record<string, EncargoOrderRow[]> = {}
          for (const [eventId, list] of Object.entries(prev)) {
            next[eventId] = list.map((o) => (o.id === orderId ? { ...o, status } : o))
          }
          return next
        })
        toast.success('Estado del pedido actualizado')
      } catch (e) {
        toast.error((e as Error)?.message ?? 'Error actualizando pedido')
      } finally {
        setOrderStatusBusyId(null)
      }
    },
    []
  )

  const handleDayClick = (day: Date) => {
    const key = format(day, 'yyyy-MM-dd')
    trackReservasDayList(formatYmdShort(key), { day: key })
    setListModalDay(key)
  }

  const listModalReservations = listModalDay ? (byDate[listModalDay] ?? []) : []
  const listModalEncargos = listModalDay ? (encargosByDate[listModalDay] ?? []) : []
  const listModalOrders = listModalDay
    ? ordersForDay(listModalDay, encargosByDate, ordersByEventId)
    : []

  const handlePrevMonth = () => setViewMonth((vm) => subMonths(vm, 1))
  const handleNextMonth = () => setViewMonth((vm) => addMonths(vm, 1))

  return (
    <div className="min-h-screen bg-zinc-50 pb-10">
      <div className="max-w-lg mx-auto px-4 py-4 md:py-6">
        <div className="rounded-2xl border border-zinc-100 bg-white overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-zinc-100 min-h-[52px]">
            <div className="min-w-0">
              <h1 className="text-lg font-black text-[#36606F] tracking-tight">Reservas y encargos</h1>
              <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">Toca un día para ver la agenda</p>
            </div>
            <a
              href="https://marbella-web.vercel.app/reservas-interno"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 min-h-12 flex items-center text-[10px] font-black uppercase tracking-widest text-[#36606F] hover:opacity-80 transition-opacity"
            >
              + Reserva
            </a>
          </div>

          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#36606F] text-white min-h-[52px]">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="shrink-0 min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10 active:scale-95 transition"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            <span className="text-sm font-black capitalize text-center flex-1 truncate">
              {format(viewMonth, 'MMMM yyyy', { locale: es })}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="shrink-0 min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10 active:scale-95 transition"
              aria-label="Mes siguiente"
            >
              <ChevronRight size={20} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex items-center gap-4 px-3 py-2 border-b border-zinc-100 bg-zinc-50/80">
            <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-zinc-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden />
              Reserva
            </span>
            <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-zinc-500">
              <span className="w-2 h-2 rounded-full bg-[#36606F] shrink-0" aria-hidden />
              Encargo
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <LoadingSpinner size="lg" className="text-[#36606F]" />
            </div>
          ) : rpcError ? (
            <div className="px-4 py-3 border-t border-rose-200 text-rose-700">
              <div className="text-sm font-black">Error</div>
              <div className="text-xs font-medium">{rpcError}</div>
            </div>
          ) : (
            <div className="w-full min-w-0">
              <div className="grid grid-cols-7 border-b border-zinc-100 bg-zinc-50">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                  <div
                    key={d}
                    className="h-8 flex items-center justify-center border-r border-zinc-100 last:border-r-0"
                  >
                    <span className="text-[10px] font-black uppercase text-zinc-400">{d}</span>
                  </div>
                ))}
              </div>
              {calendarWeeks.map((week, weekIdx) => (
                <div
                  key={weekIdx}
                  className="grid grid-cols-7 border-b border-zinc-100 last:border-b-0"
                >
                  {week.map((day) => {
                    const key = format(day, 'yyyy-MM-dd')
                    const isViewMonthDay = isSameMonth(day, viewMonth)
                    const cellReservations = byDate[key] ?? []
                    const cellEncargos = (encargosByDate[key] ?? []).filter((e) => !e.reservation_id)
                    const maxEntries = 2
                    const visibleRes = cellReservations.slice(0, maxEntries)
                    const remainingSlots = Math.max(0, maxEntries - visibleRes.length)
                    const visibleEnc = cellEncargos.slice(0, remainingSlots)
                    const hiddenCount =
                      cellReservations.length -
                      visibleRes.length +
                      (cellEncargos.length - visibleEnc.length)
                    const hasCalendarEntries =
                      cellReservations.length > 0 || cellEncargos.length > 0
                    const today = isToday(day)

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => isViewMonthDay && handleDayClick(day)}
                        disabled={!isViewMonthDay}
                        className={cn(
                          'group relative flex flex-col text-left min-h-[72px] md:min-h-[88px] transition-colors p-1.5',
                          'border-r border-zinc-100 last:border-r-0',
                          !isViewMonthDay && 'opacity-30 pointer-events-none bg-zinc-50/50',
                          isViewMonthDay && 'bg-white hover:bg-[#36606F]/5 active:bg-[#36606F]/10 cursor-pointer'
                        )}
                      >
                        <span
                          className={cn(
                            'text-[10px] font-black leading-none',
                            today && isViewMonthDay
                              ? 'text-[#36606F]'
                              : isViewMonthDay
                                ? 'text-zinc-700'
                                : 'text-zinc-400'
                          )}
                        >
                          {format(day, 'd')}
                        </span>
                        <div className="flex-1 flex flex-col justify-start w-full mt-1 gap-1 overflow-hidden">
                          {isViewMonthDay && hasCalendarEntries ? (
                            <>
                              {visibleRes.map((r) => (
                                <ReservationCalendarEntry key={r.id} r={r} />
                              ))}
                              {visibleEnc.map((e) => (
                                <EncargoCalendarEntry key={e.id} e={e} />
                              ))}
                              {hiddenCount > 0 ? (
                                <span className="text-[8px] font-bold text-zinc-400">+{hiddenCount}</span>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {typeof document !== 'undefined' &&
        listModalDay &&
        createPortal(
          <DayAgendaModal
            dayYmd={listModalDay}
            reservations={listModalReservations}
            encargos={listModalEncargos}
            orders={listModalOrders}
            canManageOrders={canManageOrders}
            orderStatusBusyId={orderStatusBusyId}
            plusPedidoBusy={isPendingEncargo}
            onClose={() => setListModalDay(null)}
            onSelectReservation={(r) => {
              const full = listModalReservations.find((x) => x.id === r.id)
              if (!full) return
              trackReservasDetail(reservationApplySummary(full), { reservationId: full.id })
              setSelectedReservation(full)
            }}
            onOpenEncargo={openEncargoEditor}
            onPlusPedido={() => {
              trackReservasPlusPedido(formatYmdShort(listModalDay), { day: listModalDay })
              setCreateEncargoDay(listModalDay)
            }}
            onOrderStatusChange={(orderId, status) => void handleOrderStatusChange(orderId, status)}
          />,
          document.body
        )}

      {typeof document !== 'undefined' &&
        createEncargoDay &&
        createPortal(
          <CreateEncargoQuickModal
            dayYmd={createEncargoDay}
            busy={isPendingEncargo}
            onClose={() => setCreateEncargoDay(null)}
            onSubmit={(data) => submitCreateEncargo(createEncargoDay, data, null)}
          />,
          document.body
        )}

      {typeof document !== 'undefined' &&
        selectedReservation &&
        createPortal(
          <ReservationDetailModal
            reservation={selectedReservation}
            linkedEncargos={encargosForReservation(selectedReservation.id, allEncargos)}
            actionBusy={actionBusy[selectedReservation.id] ?? null}
            plusPedidoBusy={isPendingEncargo}
            onClose={() => setSelectedReservation(null)}
            onAction={(action) => void mutateReservation(selectedReservation, action)}
            onPlusPedido={() => startEncargoFromReservation(selectedReservation)}
            onOpenEncargo={openEncargoEditor}
          />,
          document.body
        )}
    </div>
  )
}
