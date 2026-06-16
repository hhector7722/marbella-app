'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
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

import { createEncargoAction } from '@/app/dashboard/eventos/actions'
import {
  CreateEncargoQuickModal,
  DayAgendaModal,
} from '@/components/reservas/DayAgendaModal'
import { EncargoOrderViewModal } from '@/components/reservas/EncargoOrderViewModal'
import { EncargoProductEditor } from '@/components/reservas/EncargoProductEditor'

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
  timeShortHm,
} from '@/lib/reservas-encargos-calendar'
import {
  orderItemsToStaffLines,
  parseOrderItems,
  primaryOrderForEncargo,
} from '@/lib/encargo-staff-helpers'

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
      return 'bg-amber-50 text-amber-700 border-amber-100'
    case 'confirmed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100'
    case 'rejected':
      return 'bg-rose-50 text-rose-700 border-rose-100'
    case 'cancelled':
      return 'bg-zinc-100 text-zinc-700 border-zinc-200'
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
    <div className="flex flex-col min-w-0 w-full leading-none">
      <div className="flex items-center gap-1 min-w-0 h-5 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#36606F]" aria-hidden />
        <span className="text-[9px] font-mono leading-none whitespace-nowrap text-[#36606F]">
          {timeShortHm(e.event_time)}
        </span>
      </div>
      <span className="text-[8px] font-normal leading-none ml-[10px] truncate text-[#36606F]">
        {e.name}
      </span>
    </div>
  )
}

function ReservationCalendarEntry({ r }: { r: Reservation }) {
  const isPast = isReservationPast(r)
  return (
    <div className="flex flex-col min-w-0 w-full leading-none">
      <div className="flex items-center gap-1 min-w-0 h-5 shrink-0">
        <div
          className={cn('w-1.5 h-1.5 rounded-full shrink-0', reservationDotClass(r))}
          aria-hidden
        />
        <span
          className={cn(
            'text-[9px] font-mono leading-none whitespace-nowrap',
            isPast ? 'text-gray-400' : 'text-gray-700'
          )}
        >
          {timeShort(r.reservation_time)}
        </span>
      </div>
      <span
        className={cn(
          'text-[8px] font-normal leading-none ml-[10px] truncate',
          isPast ? 'text-gray-400' : 'text-gray-700'
        )}
      >
        {r.customer_name}
      </span>
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

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
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
            <div
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide',
                statusTone(reservation.status)
              )}
            >
              {statusLabel(reservation.status)}
            </div>
          </div>

          <a
            href={`https://wa.me/${formatPhone(reservation.customer_phone)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'min-h-12 flex items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50 px-3',
              'text-zinc-700 font-bold text-[12px] transition',
              'hover:text-zinc-900 active:scale-95'
            )}
          >
            <Phone className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2.5} />
            <span className="truncate">{reservation.customer_phone}</span>
          </a>

          {reservation.notes ? (
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Notas</div>
              <div className="mt-1 text-[12px] font-medium text-zinc-800 whitespace-pre-wrap">
                {reservation.notes}
              </div>
            </div>
          ) : null}

          {linkedEncargos.length > 0 ? (
            <div className="rounded-xl border border-[#36606F]/15 bg-[#36606F]/5 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-[#36606F]">Encargos</div>
              <div className="mt-2 flex flex-col gap-2">
                {linkedEncargos.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpenEncargo(e.id)}
                    className="min-h-12 rounded-xl border border-[#36606F]/20 bg-white px-3 text-left text-[12px] font-bold text-zinc-800 hover:bg-zinc-50"
                  >
                    {timeShortHm(e.event_time)} · {e.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {deleteConfirmOpen ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 flex flex-col gap-3 shrink-0 mt-auto">
              <p className="text-[13px] font-black text-rose-900 text-center">
                ¿Eliminar la reserva de {reservation.customer_name}?
              </p>
              <p className="text-[11px] font-medium text-rose-700 text-center">
                Esta acción no se puede deshacer.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={isBusy}
                  className={cn(
                    'min-h-12 rounded-xl font-black text-[11px] uppercase tracking-wide',
                    'bg-white text-zinc-700 border border-zinc-200 shadow-sm active:scale-95 transition',
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
                    'min-h-12 rounded-xl font-black text-[11px] uppercase tracking-wide',
                    'bg-rose-600 text-white shadow-sm active:scale-95 transition',
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
            <div className="grid grid-cols-3 gap-2 shrink-0 mt-auto">
              <button
                type="button"
                onClick={() => onAction('confirm')}
                disabled={isBusy}
                className={cn(
                  'min-h-12 rounded-xl font-black text-[11px] uppercase tracking-wide',
                  'bg-emerald-600 text-white shadow-sm active:scale-95 transition',
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
                  'min-h-12 rounded-xl font-black text-[11px] uppercase tracking-wide',
                  'bg-rose-600 text-white shadow-sm active:scale-95 transition',
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
                  'min-h-12 rounded-xl font-black text-[11px] uppercase tracking-wide',
                  'bg-zinc-200 text-zinc-800 shadow-sm active:scale-95 transition',
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
  const [viewEncargoId, setViewEncargoId] = useState<string | null>(null)
  const [editEncargoId, setEditEncargoId] = useState<string | null>(null)
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)
  const [actionBusy, setActionBusy] = useState<Record<string, ActionKind | null>>({})

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

  const openViewEncargo = useCallback((eventId: string) => {
    setViewEncargoId(eventId)
  }, [])

  const openEditEncargo = useCallback((eventId: string) => {
    setViewEncargoId(null)
    setEditEncargoId(eventId)
  }, [])

  const refreshAfterEncargoChange = useCallback(() => {
    void fetchMonthData()
    setEditEncargoId(null)
    setViewEncargoId(null)
  }, [fetchMonthData])

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
        await fetchMonthData()
        setEditEncargoId(res.eventId)
      })
    },
    [trackReservasPlusPedido, fetchMonthData]
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

  const handleDayClick = (day: Date) => {
    const key = format(day, 'yyyy-MM-dd')
    trackReservasDayList(formatYmdShort(key), { day: key })
    setListModalDay(key)
  }

  const listModalReservations = listModalDay ? (byDate[listModalDay] ?? []) : []
  const listModalEncargos = listModalDay ? (encargosByDate[listModalDay] ?? []) : []

  const viewEncargo = viewEncargoId ? allEncargos.find((e) => e.id === viewEncargoId) ?? null : null
  const viewEncargoOrder = viewEncargo
    ? primaryOrderForEncargo(viewEncargo.id, ordersByEventId)
    : null
  const viewEncargoItems = parseOrderItems(viewEncargoOrder?.items ?? [])

  const editEncargo = editEncargoId ? allEncargos.find((e) => e.id === editEncargoId) ?? null : null
  const editEncargoOrder = editEncargo ? primaryOrderForEncargo(editEncargo.id, ordersByEventId) : null
  const editEncargoInitialItems = orderItemsToStaffLines(parseOrderItems(editEncargoOrder?.items ?? []))

  const handlePrevMonth = () => setViewMonth((vm) => subMonths(vm, 1))
  const handleNextMonth = () => setViewMonth((vm) => addMonths(vm, 1))

  return (
    <div className="bg-[#5B8FB9] min-h-screen">
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
          <div className="bg-[#36606F] rounded-t-2xl px-4 py-2.5 flex items-center justify-between gap-3 shrink-0 min-h-[52px]">
            <h1 className="text-[13px] md:text-sm font-black text-white uppercase tracking-widest shrink min-w-0 truncate">
              Reservas y encargos
            </h1>
            <a
              href="https://marbella-web.vercel.app/reservas-interno"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[10px] md:text-[11px] font-black text-white uppercase tracking-widest hover:text-white/80 transition-colors min-h-[48px] flex items-center"
            >
              + HACER RESERVA
            </a>
          </div>

          <div className="p-4 bg-zinc-50/50 flex flex-col gap-2 shrink-0">
            <div className="flex justify-center w-full">
              <div className="inline-flex items-center justify-center gap-1 sm:gap-2 max-w-full">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="shrink-0 p-2 rounded-xl hover:bg-zinc-100 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center text-[#36606F]"
                  aria-label="Mes anterior"
                >
                  <ChevronLeft size={22} />
                </button>
                <span className="text-base md:text-lg font-black text-[#36606F] capitalize text-center px-1 sm:px-2 min-w-0 max-w-[min(100%,14rem)] sm:max-w-none">
                  {format(viewMonth, 'MMMM yyyy', { locale: es })}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="shrink-0 p-2 rounded-xl hover:bg-zinc-100 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center text-[#36606F]"
                  aria-label="Mes siguiente"
                >
                  <ChevronRight size={22} />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <LoadingSpinner size="lg" className="text-[#36606F]" />
              </div>
            ) : rpcError ? (
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-rose-700">
                <div className="text-sm font-black">Error</div>
                <div className="text-xs font-medium">{rpcError}</div>
              </div>
            ) : (
              <div className="w-full min-w-0 rounded-xl border border-zinc-200 shadow-[0_2px_10px_rgba(0,0,0,0.08)] overflow-hidden bg-white">
                <div className="grid grid-cols-7 border-b border-gray-100">
                  {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, index) => (
                    <div
                      key={d}
                      className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-sm border-r border-white/30 last:border-r-0"
                    >
                      <span className="text-[9px] font-bold text-white uppercase tracking-wider truncate px-0.5 drop-shadow-sm leading-none">
                        <span className="hidden md:inline">{d}</span>
                        <span className="md:hidden">{['L', 'M', 'X', 'J', 'V', 'S', 'D'][index]}</span>
                      </span>
                    </div>
                  ))}
                </div>
                {calendarWeeks.map((week, weekIdx) => (
                  <div key={weekIdx} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
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
                            'group relative flex flex-col text-left min-h-[64px] md:min-h-[108px] transition-colors p-1',
                            'border-r border-gray-100 last:border-r-0 bg-white',
                            !isViewMonthDay && 'opacity-25 pointer-events-none',
                            isViewMonthDay &&
                              'hover:bg-blue-50/50 active:bg-blue-50/70 cursor-pointer'
                          )}
                        >
                          <span
                            className={cn(
                              'absolute top-1 right-1 text-[9px] font-bold',
                              today && isViewMonthDay ? 'text-blue-600' : 'text-gray-400',
                              !isViewMonthDay && 'opacity-50'
                            )}
                          >
                            {format(day, 'd')}
                          </span>
                          <div className="flex-1 flex flex-col justify-center w-full pb-1 mt-4 min-h-[52px] gap-0.5 overflow-hidden">
                            {isViewMonthDay && hasCalendarEntries ? (
                              <>
                                {visibleRes.map((r) => (
                                  <ReservationCalendarEntry key={r.id} r={r} />
                                ))}
                                {visibleEnc.map((e) => (
                                  <EncargoCalendarEntry key={e.id} e={e} />
                                ))}
                                {hiddenCount > 0 ? (
                                  <span className="text-[8px] text-gray-400">+{hiddenCount} más</span>
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
      </div>

      {typeof document !== 'undefined' &&
        listModalDay &&
        createPortal(
          <DayAgendaModal
            dayYmd={listModalDay}
            reservations={listModalReservations}
            encargos={listModalEncargos}
            plusPedidoBusy={isPendingEncargo}
            onClose={() => setListModalDay(null)}
            onSelectReservation={(r) => {
              const full = listModalReservations.find((x) => x.id === r.id)
              if (!full) return
              trackReservasDetail(reservationApplySummary(full), { reservationId: full.id })
              setSelectedReservation(full)
            }}
            onViewEncargoOrder={openViewEncargo}
            onPlusPedido={() => {
              trackReservasPlusPedido(formatYmdShort(listModalDay), { day: listModalDay })
              setCreateEncargoDay(listModalDay)
            }}
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
            onOpenEncargo={openViewEncargo}
          />,
          document.body
        )}

      {typeof document !== 'undefined' &&
        viewEncargo &&
        createPortal(
          <EncargoOrderViewModal
            encargoName={viewEncargo.name}
            encargoTime={timeShortHm(viewEncargo.event_time)}
            items={viewEncargoItems}
            onClose={() => setViewEncargoId(null)}
            onEdit={() => openEditEncargo(viewEncargo.id)}
          />,
          document.body
        )}

      {typeof document !== 'undefined' &&
        editEncargo &&
        createPortal(
          <EncargoProductEditor
            eventId={editEncargo.id}
            eventName={editEncargo.name}
            orderId={editEncargoOrder?.id ?? null}
            initialItems={editEncargoInitialItems}
            onClose={() => setEditEncargoId(null)}
            onSaved={refreshAfterEncargoChange}
            onDeleted={refreshAfterEncargoChange}
          />,
          document.body
        )}
    </div>
  )
}
