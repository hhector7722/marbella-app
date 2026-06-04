'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { useUnreadNotifications } from '@/contexts/UnreadNotificationsContext'
import { cn } from '@/lib/utils'
import {
  formatNotificationDateTimeLine,
  getNotificationVisual,
  type UserNotificationRow,
} from '@/lib/user-notifications'

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

/** Badge estilo iOS — mismo estilo; en campana un poco más compacto. */
function NotificationCountBadge({
  label,
  placement = 'inline',
}: {
  label: string
  placement?: 'inline' | 'bell'
}) {
  const compact = placement === 'bell'
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-[#FF3B30] text-white tabular-nums',
        'font-semibold leading-none shadow-[0_1px_4px_rgba(255,59,48,0.4)]',
        compact
          ? 'min-h-[15px] min-w-[15px] px-[3px] text-[9px]'
          : 'min-h-[18px] min-w-[18px] px-1 text-[11px]'
      )}
    >
      {label}
    </span>
  )
}

function NotificationsEmptyState() {
  return (
    <div className="flex min-h-[168px] flex-col items-center justify-center px-5 py-10 text-center">
      <Check className="mb-4 size-9 text-[#2F5D6A]/35" strokeWidth={1.25} aria-hidden />
      <p className="text-[15px] font-semibold tracking-tight text-[#2F5D6A]">Todo al día</p>
      <p className="mt-1.5 max-w-[220px] text-[13px] leading-relaxed text-black/55">
        No hay notificaciones pendientes
      </p>
    </div>
  )
}

function NotificationCard({
  row,
  onOpen,
}: {
  row: UserNotificationRow
  onOpen: (row: UserNotificationRow) => void
}) {
  const { Icon, iconClass, critical } = getNotificationVisual(row.type, row.entity_type)
  const dateTimeLine = formatNotificationDateTimeLine(row.created_at)

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
          critical
            ? 'border-rose-200/60 hover:border-rose-300/70'
            : 'border-black/[0.04] hover:border-black/[0.08]'
        )}
      >
        <div className="flex gap-2">
          <Icon
            className={cn('mt-0.5 size-4 shrink-0', iconClass)}
            strokeWidth={1.25}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-snug tracking-tight text-[#2F5D6A]">
              {row.title}
            </p>
            {row.body ? (
              <p className="mt-1 text-[12px] leading-relaxed text-black/55 line-clamp-3 whitespace-pre-line">
                {row.body}
              </p>
            ) : null}
            {dateTimeLine ? (
              <p className="mt-2 text-right text-[11px] font-medium tabular-nums text-black/40">
                {dateTimeLine}
              </p>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  )
}

export function NotificationsBell() {
  const router = useRouter()
  const pathname = usePathname()
  const { userId, unreadCount, items, loading, refresh, supabase } = useUnreadNotifications()
  const [open, setOpen] = useState(false)
  const [portalMounted, setPortalMounted] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [panelAnchor, setPanelAnchor] = useState<PanelAnchor | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPortalMounted(true)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

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

  useEffect(() => {
    if (open && userId) void refresh()
  }, [open, userId, refresh])

  const markRead = useCallback(
    async (id: string) => {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('user_notifications')
        .update({ read_at: now })
        .eq('id', id)
        .eq('user_id', userId ?? '')

      if (error) {
        toast.error(error.message || 'No se pudo marcar como leída')
        return false
      }
      await refresh()
      return true
    },
    [supabase, userId, refresh]
  )

  const handleOpenItem = useCallback(
    async (row: UserNotificationRow) => {
      await markRead(row.id)
      setOpen(false)
      router.push(row.action_url)
    },
    [markRead, router]
  )

  const clearAll = useCallback(async () => {
    if (!userId || unreadCount === 0) return
    setClearingAll(true)
    try {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('user_notifications')
        .update({ read_at: now })
        .eq('user_id', userId)
        .is('read_at', null)

      if (error) {
        toast.error(error.message || 'No se pudieron borrar las notificaciones')
        return
      }
      await refresh()
    } finally {
      setClearingAll(false)
    }
  }, [supabase, userId, unreadCount, refresh])

  if (!userId) return null

  const badgeLabel = unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : ''
  const hasItems = items.length > 0
  const showEmpty = !loading && !hasItems

  const panelPortal =
    open && portalMounted && panelAnchor
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label="Notificaciones"
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
                      Notificaciones
                    </p>
                    {unreadCount > 0 ? <NotificationCountBadge label={badgeLabel} /> : null}
                  </div>
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => void clearAll()}
                      disabled={clearingAll}
                      className="shrink-0 min-h-9 rounded-lg px-2 text-[11px] font-medium text-black/45 transition-colors hover:bg-black/[0.04] hover:text-[#2F5D6A] disabled:opacity-50"
                    >
                      {clearingAll ? '…' : 'Borrar todo'}
                    </button>
                  ) : null}
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
                    <NotificationsEmptyState />
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {items.map((row) => (
                        <NotificationCard
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
          unreadCount > 0
            ? `Notificaciones, ${unreadCount} sin leer`
            : 'Notificaciones'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="relative inline-flex size-[22px] shrink-0 items-center justify-center">
          <Bell size={20} strokeWidth={1.5} className="text-white/95" aria-hidden />
          {badgeLabel ? (
            <span
              className="pointer-events-none absolute right-0 top-0 z-10 translate-x-[42%] -translate-y-[42%]"
              aria-hidden
            >
              <NotificationCountBadge label={badgeLabel} placement="bell" />
            </span>
          ) : null}
        </span>
      </button>
      {panelPortal}
    </div>
  )
}
