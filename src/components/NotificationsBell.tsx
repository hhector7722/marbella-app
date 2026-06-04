'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { useUnreadNotifications } from '@/contexts/UnreadNotificationsContext'
import { cn } from '@/lib/utils'
import { formatNotificationTime, type UserNotificationRow } from '@/lib/user-notifications'

const PANEL_GAP_PX = 8
const CARET_OFFSET_FROM_PANEL_RIGHT_PX = 24
const PANEL_RADIUS = 'rounded-[26px]'

type PanelAnchor = {
  top: number
  right: number
}

function NotificationsEmptyState() {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center px-6 py-8 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[#5B8FB9]/10">
        <CheckCircle2
          className="size-7 text-[#2F5D6A]"
          strokeWidth={2}
          aria-hidden
        />
      </div>
      <p className="text-[15px] font-semibold tracking-tight text-[#2F5D6A]">
        Todo al día
      </p>
      <p className="mt-1 max-w-[240px] text-[13px] leading-snug text-zinc-500">
        No hay notificaciones pendientes
      </p>
    </div>
  )
}

function NotificationListItem({
  row,
  onOpen,
}: {
  row: UserNotificationRow
  onOpen: (row: UserNotificationRow) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="group flex w-full gap-3 px-4 py-3.5 text-left transition-colors min-h-[56px] hover:bg-zinc-50/90 active:bg-zinc-100/80"
      >
        <span
          className="mt-2 size-2 shrink-0 rounded-full bg-[#5B8FB9]"
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="text-[14px] font-semibold leading-snug tracking-tight text-[#2F5D6A]">
              {row.title}
            </span>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-zinc-400">
              {formatNotificationTime(row.created_at)}
            </span>
          </span>
          {row.body ? (
            <span className="mt-0.5 block text-[12px] leading-relaxed text-zinc-500 line-clamp-2">
              {row.body}
            </span>
          ) : null}
        </span>
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
              'fixed z-[110] w-[min(340px,calc(100vw-1.5rem))]',
              'animate-in fade-in slide-in-from-top-2 duration-200',
              'origin-top-right'
            )}
            style={{
              top: panelAnchor.top,
              right: panelAnchor.right,
            }}
          >
            {/* Pico minimalista — continuidad con la campana */}
            <span
              className={cn(
                'pointer-events-none absolute -top-[6px] block size-3 rotate-45 bg-white',
                'shadow-[0_-2px_8px_rgba(47,93,106,0.06)]'
              )}
              style={{ right: CARET_OFFSET_FROM_PANEL_RIGHT_PX }}
              aria-hidden
            />

            <div
              className={cn(
                PANEL_RADIUS,
                'relative overflow-hidden bg-white',
                'shadow-[0_20px_50px_-12px_rgba(47,93,106,0.22),0_8px_24px_-8px_rgba(15,23,42,0.1)]',
                'ring-1 ring-black/[0.04]'
              )}
            >
              {/* Cabecera minimal */}
              <div className="flex items-center justify-between gap-3 border-b border-zinc-100/90 px-4 py-3">
                <p className="text-[13px] font-semibold tracking-tight text-[#2F5D6A]">
                  Notificaciones
                </p>
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => void clearAll()}
                    disabled={clearingAll}
                    className="min-h-9 shrink-0 rounded-full px-3 text-[12px] font-medium text-[#5B8FB9] transition-colors hover:text-[#2F5D6A] disabled:opacity-50"
                  >
                    {clearingAll ? 'Borrando…' : 'Borrar todo'}
                  </button>
                ) : null}
              </div>

              <div
                className={cn(
                  showEmpty && 'min-h-[160px]',
                  hasItems && 'max-h-[min(52vh,320px)] overflow-y-auto'
                )}
              >
                {loading && !hasItems ? (
                  <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 py-8">
                    <Loader2 className="size-6 animate-spin text-[#5B8FB9]" aria-hidden />
                    <p className="text-[13px] text-zinc-500">Cargando…</p>
                  </div>
                ) : showEmpty ? (
                  <NotificationsEmptyState />
                ) : (
                  <ul className="divide-y divide-zinc-100/90 py-0.5">
                    {items.map((row) => (
                      <NotificationListItem
                        key={row.id}
                        row={row}
                        onOpen={(r) => void handleOpenItem(r)}
                      />
                    ))}
                  </ul>
                )}
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
