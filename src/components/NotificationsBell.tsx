'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'

import { useUnreadNotifications } from '@/contexts/UnreadNotificationsContext'
import { cn } from '@/lib/utils'
import { formatNotificationTime, type UserNotificationRow } from '@/lib/user-notifications'

const PANEL_GAP_PX = 10
/** Centra el pico bajo el centro del botón campana (48px). */
const CARET_OFFSET_FROM_PANEL_RIGHT_PX = 24

type PanelAnchor = {
  top: number
  right: number
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
      right: Math.max(8, window.innerWidth - rect.right),
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

  const panelPortal =
    open && portalMounted && panelAnchor
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label="Notificaciones sin leer"
            className="fixed z-[110] w-[min(16.5rem,calc(100vw-1.5rem))] animate-in fade-in zoom-in-95 duration-200 origin-top-right"
            style={{
              top: panelAnchor.top,
              right: panelAnchor.right,
            }}
          >
            {/* Pico que une el panel con la campana */}
            <span
              className="pointer-events-none absolute -top-[7px] block size-3.5 rotate-45 border-2 border-white bg-rose-600"
              style={{ right: CARET_OFFSET_FROM_PANEL_RIGHT_PX }}
              aria-hidden
            />

            <div
              className={cn(
                'relative rounded-2xl border-2 border-white shadow-2xl overflow-hidden',
                'ring-2 ring-white/30'
              )}
            >
              <div className="bg-rose-600 border-b-2 border-white px-4 py-3 flex items-center justify-between gap-2 text-white shrink-0">
                <p className="text-sm font-black uppercase tracking-wider leading-none shrink-0">
                  Notificaciones
                </p>
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => void clearAll()}
                    disabled={clearingAll}
                    className="shrink-0 min-h-10 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wide text-white/95 hover:bg-white/15 active:bg-white/25 disabled:opacity-50 transition-colors"
                  >
                    {clearingAll ? 'Borrando…' : 'Borrar todo'}
                  </button>
                ) : null}
              </div>

              <div className="max-h-[min(55vh,300px)] overflow-y-auto bg-[#4A7A89] text-white">
                {loading && items.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm font-medium text-white/80">
                    Cargando…
                  </p>
                ) : items.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm font-medium text-white/80">
                    No tienes notificaciones pendientes
                  </p>
                ) : (
                  <ul className="divide-y divide-white">
                    {items.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => void handleOpenItem(row)}
                          className="w-full text-left px-4 py-3 bg-[#4A7A89] text-white transition-colors min-h-[56px] hover:bg-[#3F707F] active:bg-[#3F707F] active:scale-[0.99]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-black text-white leading-snug">
                              {row.title}
                            </p>
                            <span className="text-[10px] font-bold text-white/70 shrink-0 tabular-nums">
                              {formatNotificationTime(row.created_at)}
                            </span>
                          </div>
                          {row.body ? (
                            <p className="text-xs text-white/80 mt-1 line-clamp-2">{row.body}</p>
                          ) : null}
                        </button>
                      </li>
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
          'relative grid place-items-center min-h-12 min-w-12 shrink-0 text-white active:scale-95 transition-transform',
          open && 'scale-95'
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
          <Bell size={22} strokeWidth={2.5} className="text-white" aria-hidden />
          {badgeLabel ? (
            <span
              className="pointer-events-none absolute -top-1.5 -right-1.5 z-10 min-w-[17px] h-[17px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black leading-none flex items-center justify-center ring-2 ring-white"
              aria-hidden
            >
              {badgeLabel}
            </span>
          ) : null}
        </span>
      </button>
      {panelPortal}
    </div>
  )
}
