'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import {
  formatNotificationTime,
  type UserNotificationRow,
} from '@/lib/user-notifications'
import { createClient } from '@/utils/supabase/client'

const PANEL_LIMIT = 30

export function NotificationsBell() {
  const router = useRouter()
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<UserNotificationRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const fetchUnread = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const { data, error, count } = await supabase
        .from('user_notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(PANEL_LIMIT)

      if (error) throw error
      setItems((data ?? []) as UserNotificationRow[])
      setUnreadCount(count ?? (data?.length ?? 0))
    } catch (e) {
      const msg =
        (e as { message?: string })?.message ||
        'No se pudieron cargar las notificaciones'
      toast.error(msg)
      setItems([])
      setUnreadCount(0)
    } finally {
      setLoading(false)
    }
  }, [supabase, userId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      setUserId(session?.user?.id ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  useEffect(() => {
    if (!userId) return
    void fetchUnread()
  }, [userId, fetchUnread])

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`user_notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void fetchUnread()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void fetchUnread()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, userId, fetchUnread])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (open && userId) void fetchUnread()
  }, [open, userId, fetchUnread])

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
      setItems((prev) => prev.filter((n) => n.id !== id))
      setUnreadCount((c) => Math.max(0, c - 1))
      return true
    },
    [supabase, userId]
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

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center min-h-12 min-w-12 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 active:scale-95 transition-all"
        aria-label={
          unreadCount > 0
            ? `Notificaciones, ${unreadCount} sin leer`
            : 'Notificaciones'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={20} strokeWidth={2.5} className="text-white" />
        {badgeLabel ? (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-[#5B8FB9]"
            aria-hidden
          >
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notificaciones sin leer"
          className={cn(
            'absolute right-0 top-full mt-2 z-[110] w-[min(100vw-1rem,22rem)]',
            'rounded-2xl border border-zinc-100 bg-white shadow-2xl overflow-hidden',
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

          <div className="max-h-[min(60vh,320px)] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">
                No tienes notificaciones pendientes
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {items.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => void handleOpenItem(row)}
                      className="w-full text-left px-4 py-3 hover:bg-zinc-50 active:bg-zinc-100 transition-colors min-h-[56px]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-black text-zinc-900 leading-snug">
                          {row.title}
                        </p>
                        <span className="text-[10px] font-bold text-zinc-400 shrink-0 tabular-nums">
                          {formatNotificationTime(row.created_at)}
                        </span>
                      </div>
                      {row.body ? (
                        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{row.body}</p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
