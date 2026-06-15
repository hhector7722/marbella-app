'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { cn } from '@/lib/utils'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'
import { createClient } from '@/utils/supabase/client'

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

function ReservationCalendarEntry({ r }: { r: Reservation }) {
  const isPast = isReservationPast(r)
  return (
    <div className="flex gap-1 items-center min-w-0 w-full">
      <div
        className={cn('w-1.5 h-1.5 rounded-full shrink-0', reservationDotClass(r))}
        aria-hidden
      />
      <div className="flex flex-col min-w-0 flex-1 leading-none">
        <span
          className={cn(
            'text-[9px] font-mono leading-none whitespace-nowrap',
            isPast ? 'text-gray-400' : 'text-gray-700'
          )}
        >
          {timeShort(r.reservation_time)}
        </span>
        <span
          className={cn(
            'text-[8px] font-normal leading-none',
            isPast ? 'text-gray-400' : 'text-gray-800'
          )}
        >
          {r.pax === 0 ? ' ' : `${r.pax} pax`}
        </span>
      </div>
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
  actionBusy,
  onClose,
  onAction,
}: {
  reservation: Reservation
  actionBusy: ActionKind | null
  onClose: () => void
  onAction: (action: ActionKind) => void
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

function ReservationListModal({
  dayYmd,
  reservations,
  onClose,
  onSelect,
}: {
  dayYmd: string
  reservations: Reservation[]
  onClose: () => void
  onSelect: (r: Reservation) => void
}) {
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
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Reservas del día</p>
            <h3 className="text-base font-black capitalize truncate">
              {format(parseLocalSafe(dayYmd), 'EEEE d MMM', { locale: es })}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10 active:scale-95 transition"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {reservations.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r)}
              className={cn(
                'min-h-12 w-full rounded-xl border border-zinc-100 bg-white px-4 py-3 text-left',
                'shadow-sm hover:bg-zinc-50 active:scale-[0.99] transition flex items-center justify-between gap-3'
              )}
            >
              <span className="text-[13px] font-black text-zinc-800 truncate">
                {reservationLineWithName(r)}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase',
                  statusTone(r.status)
                )}
              >
                {statusLabel(r.status)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ReservasClient() {
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()
  const deepLinkHandledRef = useRef<string | null>(null)

  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [loading, setLoading] = useState(true)
  const [rpcError, setRpcError] = useState<string | null>(null)
  const [byDate, setByDate] = useState<Record<string, Reservation[]>>({})

  const [listModalDay, setListModalDay] = useState<string | null>(null)
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)
  const [actionBusy, setActionBusy] = useState<Record<string, ActionKind | null>>({})

  useModalUsageTracking({
    open: listModalDay !== null,
    usageId: 'reservas-day-list',
    usageLabel: 'Reservas del día',
  })
  useModalUsageTracking({
    open: selectedReservation !== null,
    usageId: 'reservas-detail',
    usageLabel: 'Detalle de reserva',
  })

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

  const fetchMonthReservations = useCallback(async () => {
    const seq = ++fetchSeqRef.current
    setRpcError(null)

    try {
      const { data, error } = await supabase
        .from('reservations')
        .select(
          'id, customer_name, customer_phone, reservation_date, reservation_time, pax, status, notes, created_at'
        )
        .gte('reservation_date', monthStart)
        .lte('reservation_date', monthEnd)
        .neq('status', 'cancelled')
        .order('reservation_time', { ascending: true })

      if (error) throw error

      if (seq === fetchSeqRef.current) {
        setByDate(groupByDate((data ?? []) as Reservation[]))
      }
    } catch (e) {
      const msg =
        (e as { message?: string })?.message ||
        (e as { error_description?: string })?.error_description ||
        (e as { details?: string })?.details ||
        'Error cargando reservas'
      if (seq === fetchSeqRef.current) {
        setByDate({})
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
        await fetchMonthReservations()
      } else if (action === 'reject') {
        toast.success('Reserva rechazada')
        setSelectedReservation(null)
        setListModalDay(null)
        await fetchMonthReservations()
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
    void fetchMonthReservations()
  }, [fetchMonthReservations])

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
        void fetchMonthReservations()
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
            void fetchMonthReservations()
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, monthStart, monthEnd, fetchMonthReservations, removeReservationFromState])

  const handleDayClick = (day: Date) => {
    const key = format(day, 'yyyy-MM-dd')
    const dayReservations = byDate[key] ?? []
    if (dayReservations.length === 0) return
    if (dayReservations.length === 1) {
      setSelectedReservation(dayReservations[0])
      return
    }
    setListModalDay(key)
  }

  const listModalReservations = listModalDay ? (byDate[listModalDay] ?? []) : []

  const handlePrevMonth = () => setViewMonth((vm) => subMonths(vm, 1))
  const handleNextMonth = () => setViewMonth((vm) => addMonths(vm, 1))

  return (
    <div className="bg-[#5B8FB9] p-4 md:p-6 pb-24 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl relative overflow-hidden flex flex-col">
          <div className="bg-[#36606F] px-3 md:px-6 py-4 flex items-center justify-between gap-2 shrink-0">
            <h1 className="text-lg md:text-xl font-black text-white uppercase tracking-wider shrink min-w-0 truncate">
              Reservas
            </h1>
          </div>

          <div className="px-4 md:px-8 pt-2 pb-4 md:pb-6 flex flex-col gap-2 shrink-0">
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
              <div className="flex flex-col">
                <div className="overflow-x-auto no-scrollbar">
                  <div className="min-w-0 rounded-xl border border-zinc-200 shadow-[0_2px_10px_rgba(0,0,0,0.08)] overflow-hidden bg-white">
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
                        const dayReservations = byDate[key] ?? []
                        const isViewMonthDay = isSameMonth(day, viewMonth)
                        const hasReservations = dayReservations.length > 0
                        const maxEntries = 2
                        const visible = dayReservations.slice(0, maxEntries)
                        const hiddenCount = dayReservations.length - visible.length
                        const today = isToday(day)

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => isViewMonthDay && handleDayClick(day)}
                            disabled={!isViewMonthDay || !hasReservations}
                            className={cn(
                              'group relative flex flex-col text-left min-h-[64px] md:min-h-[108px] transition-colors p-1',
                              'border-r border-gray-100 last:border-r-0 bg-white',
                              !isViewMonthDay && 'opacity-25 pointer-events-none',
                              isViewMonthDay &&
                                hasReservations &&
                                'hover:bg-blue-50/50 active:bg-blue-50/70 cursor-pointer',
                              isViewMonthDay && !hasReservations && 'cursor-default'
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
                              {isViewMonthDay && hasReservations ? (
                                <>
                                  {visible.map((r) => (
                                    <ReservationCalendarEntry key={r.id} r={r} />
                                  ))}
                                  {hiddenCount > 0 ? (
                                    <span className="text-[8px] text-gray-400">
                                      +{hiddenCount} más
                                    </span>
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
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {typeof document !== 'undefined' &&
        listModalDay &&
        createPortal(
          <ReservationListModal
            dayYmd={listModalDay}
            reservations={listModalReservations}
            onClose={() => setListModalDay(null)}
            onSelect={(r) => {
              setListModalDay(null)
              setSelectedReservation(r)
            }}
          />,
          document.body
        )}

      {typeof document !== 'undefined' &&
        selectedReservation &&
        createPortal(
          <ReservationDetailModal
            reservation={selectedReservation}
            actionBusy={actionBusy[selectedReservation.id] ?? null}
            onClose={() => setSelectedReservation(null)}
            onAction={(action) => void mutateReservation(selectedReservation, action)}
          />,
          document.body
        )}
    </div>
  )
}
