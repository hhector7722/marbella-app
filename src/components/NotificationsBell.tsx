'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { useUnreadNotifications } from '@/contexts/UnreadNotificationsContext'
import { cn } from '@/lib/utils'
import {
  formatNotificationTime,
  getNotificationVisual,
  type UserNotificationRow,
} from '@/lib/user-notifications'

const PANEL_GAP_PX = 6
const PANEL_WIDTH_PX = 288
const CARET_OFFSET_FROM_PANEL_RIGHT_PX = 22

const PANEL_SHADOW =
  'shadow-[0_18px_45px_-14px_rgba(47,93,106,0.2),0_6px_16px_-6px_rgba(15,23,42,0.08)]'

type PanelAnchor = {
  top: number
  right: number
}

function NotificationsEmptyState() {
  return (
    <div className="flex min-h-[168px] flex-col items-center justify-center px-5 py-10 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-[20px] bg-[#2F5D6A]/10">
        <Bell className="size-8 text-[#2F5D6A]/70" strokeWidth={1.75} aria-hidden />
      </div>
      <p className="text-[15px] font-semibold tracking-tight text-[#2F5D6A]">Todo al día</p>
      <p className="mt-1.5 max-w-[220px] text-[13px] leading-relaxed text-zinc-500">
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
  const { Icon, iconClass, bgClass, critical } = getNotificationVisual(row.type)

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row)}
        className={cn(
          'w-full rounded-2xl border p-3 text-left transition-all duration-150',
          'bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]',
          'hover:shadow-[0_4px_14px_rgba(47,93,106,0.1)] hover:-translate-y-px',
          'active:scale-[0.99] active:shadow-sm min-h-[56px]',
          critical
            ? 'border-rose-100 hover:border-rose-200/80'
            : 'border-zinc-100/90 hover:border-[#2F5D6A]/15'
        )}
      >
        <div className="flex gap-3">
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl',
              bgClass
            )}
          >
            <Icon className={cn('size-[18px]', iconClass)} strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-semibold leading-snug tracking-tight text-[#2F5D6A] line-clamp-2">
                {row.title}
              </p>
              <span className="shrink-0 pt-0.5 text-[11px] font-medium tabular-nums text-zinc-400">
                {formatNotificationTime(row.created_at)}
              </span>
            </div>
            {row.body ? (
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 line-clamp-2">
                {row.body}
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
            <div className={cn('relative', PANEL_SHADOW)}>
              {/* Flecha integrada en el contenedor */}
              <div
                className="pointer-events-none absolute -top-[5px] z-20 size-2.5 rotate-45 rounded-[2px] bg-white border border-zinc-200/70 border-b-0 border-r-0"
                style={{ right: CARET_OFFSET_FROM_PANEL_RIGHT_PX }}
                aria-hidden
              />

              <div className="relative z-10 overflow-hidden rounded-[24px] bg-white ring-1 ring-zinc-200/60">
                {/* Cabecera */}
                <div className="flex items-center gap-2.5 border-b border-zinc-100 px-3 py-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#2F5D6A]/10">
                    <Bell className="size-[17px] text-[#2F5D6A]" strokeWidth={2.25} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold tracking-tight text-[#2F5D6A]">
                        Notificaciones
                      </p>
                      {unreadCount > 0 ? (
                        <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#2F5D6A] px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none text-white">
                          {badgeLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => void clearAll()}
                      disabled={clearingAll}
                      className="shrink-0 min-h-9 rounded-lg px-2 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-[#2F5D6A] disabled:opacity-50"
                    >
                      {clearingAll ? '…' : 'Borrar todo'}
                    </button>
                  ) : null}
                </div>

                {/* Cuerpo */}
                <div
                  className={cn(
                    showEmpty && 'min-h-[168px]',
                    hasItems && 'max-h-[min(50vh,300px)] overflow-y-auto bg-zinc-50/50'
                  )}
                >
                  {loading && !hasItems ? (
                    <div className="flex min-h-[168px] flex-col items-center justify-center gap-2 py-10">
                      <Loader2 className="size-5 animate-spin text-[#2F5D6A]/60" aria-hidden />
                      <p className="text-[12px] text-zinc-500">Cargando…</p>
                    </div>
                  ) : showEmpty ? (
                    <NotificationsEmptyState />
                  ) : (
                    <ul className="flex flex-col gap-2 p-2.5">
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
          open && 'scale-[0.97]'
        )}
        aria-label={
          unreadCount > 0
            ? `Notificaciones, ${unreadCount} sin leer`
            : 'Notificaciones'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="relative inline-flex shrink-0">
          <Bell size={22} strokeWidth={2.25} className="text-white" aria-hidden />
          {badgeLabel ? (
            <span className="pointer-events-none absolute -right-1 -top-1.5 z-10 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#2F5D6A] px-0.5 text-[9px] font-bold leading-none text-white shadow-sm">
              {badgeLabel}
            </span>
          ) : null}
        </span>
      </button>
      {panelPortal}
    </div>
  )
}
