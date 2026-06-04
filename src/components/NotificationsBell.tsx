'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'

import { useUnreadNotifications } from '@/contexts/UnreadNotificationsContext'
import { cn } from '@/lib/utils'
import { formatNotificationTime, type UserNotificationRow } from '@/lib/user-notifications'

export function NotificationsBell() {
  const router = useRouter()
  const { userId, unreadCount, items, loading, refresh, supabase } = useUnreadNotifications()
  const [open, setOpen] = useState(false)
  const [portalMounted, setPortalMounted] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPortalMounted(true)
  }, [])

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

  if (!userId) return null

  const badgeLabel = unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : ''

  const panelPortal =
    open && portalMounted
      ? createPortal(
          <div
            role="dialog"
            aria-modal="false"
            aria-label="Notificaciones sin leer"
            className={cn(
              'fixed z-[110] top-header-safe mt-2',
              'right-[max(0.5rem,env(safe-area-inset-right,0px))]',
              'w-[min(16.5rem,calc(100vw-1.5rem))]',
              'rounded-2xl border border-white/20 shadow-2xl overflow-hidden',
              'animate-in fade-in zoom-in-95 duration-200'
            )}
          >
            <div className="bg-[#36606F] px-4 py-3 flex items-center justify-between text-white shrink-0">
              <div>
                <p className="text-sm font-black uppercase tracking-wider leading-none">
                  Notificaciones
                </p>
                <p className="text-[10px] font-bold text-white/60 mt-0.5">
                  {unreadCount > 0 ? `${unreadCount} sin leer` : 'Al día'}
                </p>
              </div>
            </div>

            <div className="max-h-[min(55vh,300px)] overflow-y-auto bg-[#5B8FB9] text-white">
              {loading && items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-medium text-white/80">
                  Cargando…
                </p>
              ) : items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-medium text-white/80">
                  No tienes notificaciones pendientes
                </p>
              ) : (
                <ul className="divide-y divide-white/15">
                  {items.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => void handleOpenItem(row)}
                        className="w-full text-left px-4 py-3 bg-[#5B8FB9] text-white transition-colors min-h-[56px] hover:bg-[#4a7a9e] active:bg-[#4a7a9e] active:scale-[0.99]"
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
          </div>,
          document.body
        )
      : null

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid place-items-center min-h-12 min-w-12 shrink-0 text-white active:scale-95 transition-transform"
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
              className="pointer-events-none absolute -top-1.5 -right-1.5 z-10 min-w-[17px] h-[17px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black leading-none flex items-center justify-center ring-2 ring-[#5B8FB9]"
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
