'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { Calendar, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { createClient } from '@/utils/supabase/client'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'

const PANEL_GAP_PX = 6
const PANEL_WIDTH_PX = 288
const CARET_OFFSET_FROM_PANEL_RIGHT_PX = 22

const PANEL_SURFACE = 'bg-[#E8EDF0]/[0.92] backdrop-blur-[16px]'
const PANEL_SHADOW = 'shadow-[0_20px_50px_rgba(0,0,0,0.16)]'
const CARD_SURFACE = 'bg-[#F8F9FA]'

type PanelAnchor = {
  top: number
  right: number
}

type FutureReservation = {
  id: string
  customer_name: string
  customer_phone: string
  reservation_date: string
  reservation_time: string
  pax: number
  status: string
}

function CountBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-[#FF3B30] text-white tabular-nums font-semibold leading-none shadow-[0_1px_4px_rgba(255,59,48,0.4)] min-h-[15px] min-w-[15px] px-[3px] text-[9px]">
      {label}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="flex min-h-[168px] flex-col items-center justify-center px-5 py-10 text-center">
      <Check className="mb-4 size-9 text-[#2F5D6A]/35" strokeWidth={1.25} aria-hidden />
      <p className="text-[15px] font-semibold tracking-tight text-[#2F5D6A]">Sin reservas</p>
      <p className="mt-1.5 max-w-[220px] text-[13px] leading-relaxed text-black/55">
        No hay reservas próximas
      </p>
    </div>
  )
}

function ReservationCard({
  row,
  onOpen,
}: {
  row: FutureReservation
  onOpen: (row: FutureReservation) => void
}) {
  const dateObj = new Date(row.reservation_date + 'T' + (row.reservation_time || '00:00'))
  const dateStr = dateObj.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const timeStr = row.reservation_time ? row.reservation_time.slice(0, 5) : ''

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row)}
        className={cn(
          'w-full rounded-2xl border p-3.5 text-left transition-all duration-150',
          CARD_SURFACE,
          'shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
          'hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] active:scale-[0.995]',
          'min-h-[56px]',
          'border-black/[0.04] hover:border-black/[0.08]'
        )}
      >
        <div className="flex gap-2">
          <Calendar className="mt-0.5 size-4 shrink-0 text-[#2F5D6A]/45" strokeWidth={1.25} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-snug tracking-tight text-[#2F5D6A]">
              {row.customer_name}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-black/55">
              {dateStr}{timeStr ? ` · ${timeStr}` : ''} · {row.pax} pax
            </p>
          </div>
        </div>
      </button>
    </li>
  )
}

export function ReservationsBell() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [reservations, setReservations] = useState<FutureReservation[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [portalMounted, setPortalMounted] = useState(false)
  const [panelAnchor, setPanelAnchor] = useState<PanelAnchor | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useModalUsageTracking({
    open,
    usageId: 'reservations-bell',
    usageLabel: 'Reservas próximas',
  })

  useEffect(() => {
    setPortalMounted(true)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null)
    })
  }, [supabase])

  const fetchReservations = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('reservations')
        .select('id, customer_name, customer_phone, reservation_date, reservation_time, pax, status')
        .gte('reservation_date', today)
        .neq('status', 'cancelled')
        .order('reservation_date', { ascending: true })
        .order('reservation_time', { ascending: true })
        .limit(30)

      if (error) throw error
      setReservations((data ?? []) as FutureReservation[])
    } catch (e) {
      toast.error('No se pudieron cargar las reservas')
      setReservations([])
    } finally {
      setLoading(false)
    }
  }, [supabase, userId])

  useEffect(() => {
    if (userId) void fetchReservations()
  }, [userId, fetchReservations])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('reservations-bell')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reservations' }, () => {
        void fetchReservations()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservations' }, () => {
        void fetchReservations()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reservations' }, () => {
        void fetchReservations()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, userId, fetchReservations])

  useEffect(() => {
    if (!userId) return
    const onVis = () => {
      if (document.visibilityState === 'visible') void fetchReservations()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [userId, fetchReservations])

  const updatePanelAnchor = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPanelAnchor({
      top: rect.bottom + PANEL_GAP_PX,
      right: Math.max(12, window.innerWidth - rect.right),
    })
  }, [])

  useEffect(() => {
    if (!open) {
      setPanelAnchor(null)
      return
    }
    updatePanelAnchor()
    window.addEventListener('resize', updatePanelAnchor)
    window.addEventListener('scroll', updatePanelAnchor, true)
    return () => {
      window.removeEventListener('resize', updatePanelAnchor)
      window.removeEventListener('scroll', updatePanelAnchor, true)
    }
  }, [open, updatePanelAnchor])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const handleOpenItem = useCallback(
    (row: FutureReservation) => {
      setOpen(false)
      router.push(`/staff/reservas?id=${row.id}`)
    },
    [router]
  )

  if (!userId) return null

  const count = reservations.length
  if (count < 1) return null

  const badgeLabel = count > 99 ? '99+' : String(count)
  const hasItems = reservations.length > 0
  const showEmpty = !loading && !hasItems

  const panelPortal =
    open && portalMounted && panelAnchor
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label="Reservas próximas"
            className={cn(
              'fixed z-[110]',
              'animate-in fade-in slide-in-from-top-1 duration-200',
              'origin-top-right'
            )}
            style={{
              top: panelAnchor.top,
              right: panelAnchor.right,
              width: `min(${PANEL_WIDTH_PX}px, calc(100vw - 2rem))`,
              maxWidth: '340px',
            }}
          >
            <div className="relative">
              <div
                className={cn(
                  'pointer-events-none absolute -top-[5px] z-20 size-2.5 rotate-45 rounded-[2px]',
                  PANEL_SURFACE,
                  'border border-black/[0.06] border-b-0 border-r-0'
                )}
                style={{ right: CARET_OFFSET_FROM_PANEL_RIGHT_PX }}
                aria-hidden
              />
              <div
                className={cn(
                  'relative z-10 isolate overflow-hidden rounded-[24px]',
                  PANEL_SURFACE,
                  PANEL_SHADOW
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-black/[0.06] px-3.5 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="text-[13px] font-semibold tracking-tight text-[#2F5D6A]">
                      Reservas próximas
                    </p>
                    <CountBadge label={badgeLabel} />
                  </div>
                </div>
                <div
                  className={cn(
                    'rounded-b-[24px]',
                    showEmpty && 'min-h-[168px]',
                    hasItems &&
                      'max-h-[min(50vh,300px)] overflow-x-hidden overflow-y-auto overscroll-contain px-2.5 pb-3 pt-2.5'
                  )}
                >
                  {loading && !hasItems ? (
                    <div className="flex min-h-[168px] flex-col items-center justify-center gap-2 py-10">
                      <Loader2 className="size-5 animate-spin text-[#2F5D6A]/40" aria-hidden />
                      <p className="text-[12px] text-black/45">Cargando…</p>
                    </div>
                  ) : showEmpty ? (
                    <EmptyState />
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {reservations.map((row) => (
                        <ReservationCard
                          key={row.id}
                          row={row}
                          onOpen={(r) => void handleOpenItem(r)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => {
            const next = !v
            if (next) updatePanelAnchor()
            return next
          })
        }}
        className={cn(
          'relative grid min-h-12 min-w-12 shrink-0 place-items-center text-white transition-transform active:scale-95',
          open && 'opacity-90'
        )}
        aria-label={
          count > 0
            ? `Reservas próximas, ${count} pendientes`
            : 'Reservas próximas'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="relative inline-flex size-[22px] shrink-0 items-center justify-center">
          <Calendar size={20} strokeWidth={1.5} className="text-white/95" aria-hidden />
          <span
            className="pointer-events-none absolute right-0 top-0 z-10 translate-x-[42%] -translate-y-[42%]"
            aria-hidden
          >
            <CountBadge label={badgeLabel} />
          </span>
        </span>
      </button>
      {panelPortal}
    </div>
  )
}
