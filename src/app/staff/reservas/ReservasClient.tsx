'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays } from 'date-fns'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash2,
  Loader2,
  Phone,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { createClient } from '@/utils/supabase/client'

type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'rejected'

type Reservation = {
  id: string
  customer_name: string
  customer_phone: string
  reservation_date: string // YYYY-MM-DD
  reservation_time: string // HH:mm:ss
  pax: number
  status: ReservationStatus
  notes: string | null
  created_at: string
}

type ActionKind = 'confirm' | 'reject' | 'cancel'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatLocalYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
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

function getMessage(name: string, time: string) {
  return encodeURIComponent(
    `Hola ${name}, te confirmamos tu reserva en Bar La Marbella para las ${time.slice(0, 5)}. ¡Te esperamos!`
  )
}

export default function ReservasClient() {
  const supabase = useMemo(() => createClient(), [])

  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date())
  const selectedDayYmd = useMemo(() => formatLocalYmd(selectedDay), [selectedDay])

  const [loading, setLoading] = useState(true)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [rpcError, setRpcError] = useState<string | null>(null)

  const [actionBusy, setActionBusy] = useState<Record<string, ActionKind | null>>({})
  const fetchSeqRef = useRef(0)

  const dayTitle = useMemo(() => {
    return selectedDay.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  }, [selectedDay])

  async function fetchReservations(dayYmd: string) {
    const seq = ++fetchSeqRef.current
    setRpcError(null)

    try {
      const { data, error } = await supabase.rpc('consultar_reservas', { p_fecha: dayYmd })
      if (error) throw error

      const list = (Array.isArray(data) ? data : []) as Reservation[]
      if (seq === fetchSeqRef.current) {
        setReservations(list)
      }
    } catch (e) {
      const msg =
        (e as any)?.message || (e as any)?.error_description || (e as any)?.details || 'Error cargando reservas'
      if (seq === fetchSeqRef.current) {
        setReservations([])
        setRpcError(msg)
      }
      toast.error(msg)
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false)
    }
  }

  async function mutateReservation(reserva: Reservation, action: ActionKind) {
    const { id } = reserva
    setActionBusy((s) => ({ ...s, [id]: action }))
    try {
      const { data, error } = await supabase.rpc('gestionar_reservas', {
        p_accion: action,
        p_datos: { id },
      })
      if (error) throw error
      if (data?.error) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Error actualizando reserva')
      }

      if (action === 'confirm') {
        toast.success('Reserva confirmada')
        window.open(
          `https://wa.me/${formatPhone(reserva.customer_phone)}?text=${getMessage(reserva.customer_name, reserva.reservation_time)}`,
          '_blank'
        )
      }

      await fetchReservations(selectedDayYmd)
    } catch (e) {
      const msg =
        (e as any)?.message || (e as any)?.error_description || (e as any)?.details || 'Error actualizando reserva'
      toast.error(msg)
    } finally {
      setActionBusy((s) => ({ ...s, [id]: null }))
    }
  }

  useEffect(() => {
    setLoading(true)
    void fetchReservations(selectedDayYmd)
  }, [selectedDayYmd])

  useEffect(() => {
    const channel = supabase
      .channel('public:reservations')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reservations' },
        (payload: any) => {
          toast.success('¡Nueva reserva desde la web!')
          const newRow = payload?.new as { reservation_date?: string } | undefined
          if (newRow?.reservation_date && newRow.reservation_date === selectedDayYmd) {
            void fetchReservations(selectedDayYmd)
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, selectedDayYmd])

  return (
    <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-8">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <div className="rounded-2xl bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#36606F] px-4 py-3 text-white md:px-6">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-white/80">Reservas</div>
              <div className="min-w-0 truncate text-base font-black capitalize leading-tight md:text-lg">
                {dayTitle}
              </div>
              <div className="text-[11px] font-mono text-white/80">{selectedDayYmd}</div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedDay((d) => addDays(d, -1))}
                className={cn(
                  'min-h-12 min-w-12 rounded-xl bg-white/10 text-white',
                  'flex items-center justify-center active:scale-95 transition'
                )}
                aria-label="Día anterior"
              >
                <ChevronLeft size={22} strokeWidth={3} />
              </button>
              <button
                type="button"
                onClick={() => setSelectedDay(() => new Date())}
                className={cn(
                  'min-h-12 rounded-xl bg-white/10 px-4 text-[12px] font-black uppercase tracking-wide text-white',
                  'active:scale-95 transition'
                )}
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => setSelectedDay((d) => addDays(d, 1))}
                className={cn(
                  'min-h-12 min-w-12 rounded-xl bg-white/10 text-white',
                  'flex items-center justify-center active:scale-95 transition'
                )}
                aria-label="Día siguiente"
              >
                <ChevronRight size={22} strokeWidth={3} />
              </button>
            </div>
          </div>

          <div className="p-4 md:p-6">
            {loading ? (
              <div className="flex min-h-[240px] items-center justify-center text-zinc-500">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : rpcError ? (
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-rose-700">
                <div className="text-sm font-black">Error</div>
                <div className="text-xs font-medium">{rpcError}</div>
              </div>
            ) : reservations.length === 0 ? (
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-6 text-center">
                <div className="text-sm font-black text-zinc-800">Sin reservas</div>
                <div className="text-xs font-medium text-zinc-500">No hay reservas para este día.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {reservations.map((r) => {
                  const busy = actionBusy[r.id]
                  const isBusy = Boolean(busy)
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        'rounded-xl bg-white shadow-sm border border-zinc-100',
                        'p-4 flex flex-col gap-3'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <div className="text-2xl font-black tracking-tight text-zinc-900">
                              {timeShort(r.reservation_time)}
                            </div>
                            <div className="text-[12px] font-black text-zinc-500">·</div>
                            <div className="text-xl font-black tracking-tight text-zinc-900">{r.pax}</div>
                            <div className="text-[11px] font-black uppercase tracking-wide text-zinc-500">PAX</div>
                          </div>
                          <div className="mt-1 truncate text-[13px] font-black text-zinc-800">
                            {r.customer_name}
                          </div>
                        </div>

                        <div
                          className={cn(
                            'shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide',
                            statusTone(r.status)
                          )}
                        >
                          {statusLabel(r.status)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <a
                          href={`sms:+${formatPhone(r.customer_phone)}?body=${getMessage(r.customer_name, r.reservation_time)}`}
                          className={cn(
                            'min-h-12 flex items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50 px-3',
                            'text-zinc-700 font-bold text-[12px] transition min-w-0 flex-1',
                            'hover:text-zinc-900 active:scale-95'
                          )}
                        >
                          <Phone className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2.5} />
                          <span className="truncate">{r.customer_phone}</span>
                        </a>
                      </div>

                      {r.notes ? (
                        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                          <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                            Notas
                          </div>
                          <div className="mt-1 text-[12px] font-medium text-zinc-800 whitespace-pre-wrap">
                            {r.notes}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-auto grid grid-cols-3 gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void mutateReservation(r, 'confirm')}
                          disabled={isBusy}
                          className={cn(
                            'min-h-12 rounded-xl font-black text-[11px] uppercase tracking-wide',
                            'bg-emerald-600 text-white shadow-sm active:scale-95 transition',
                            'disabled:opacity-60 disabled:active:scale-100'
                          )}
                          aria-label="Confirmar"
                        >
                          <span className="inline-flex items-center justify-center gap-2">
                            {busy === 'confirm' ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
                            )}
                            <span className="hidden md:inline">Confirmar</span>
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void mutateReservation(r, 'reject')}
                          disabled={isBusy}
                          className={cn(
                            'min-h-12 rounded-xl font-black text-[11px] uppercase tracking-wide',
                            'bg-rose-600 text-white shadow-sm active:scale-95 transition',
                            'disabled:opacity-60 disabled:active:scale-100'
                          )}
                          aria-label="Rechazar"
                        >
                          <span className="inline-flex items-center justify-center gap-2">
                            {busy === 'reject' ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <XCircle className="h-5 w-5" strokeWidth={2.5} />
                            )}
                            <span className="hidden md:inline">Rechazar</span>
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void mutateReservation(r, 'cancel')}
                          disabled={isBusy}
                          className={cn(
                            'min-h-12 rounded-xl font-black text-[11px] uppercase tracking-wide',
                            'bg-zinc-200 text-zinc-800 shadow-sm active:scale-95 transition',
                            'disabled:opacity-60 disabled:active:scale-100'
                          )}
                          aria-label="Cancelar"
                        >
                          <span className="inline-flex items-center justify-center gap-2">
                            {busy === 'cancel' ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <CircleSlash2 className="h-5 w-5" strokeWidth={2.5} />
                            )}
                            <span className="hidden md:inline">Cancelar</span>
                          </span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

