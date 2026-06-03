'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import type { UserNotificationRow } from '@/lib/user-notifications'
import { createClient } from '@/utils/supabase/client'

const DEFAULT_LIMIT = 30

type Options = {
  /** Si true, carga filas para el panel (máx. limit). Si false, solo el contador. */
  withItems?: boolean
  limit?: number
  onFetchError?: (message: string) => void
}

export function useUnreadNotificationCount(options: Options = {}) {
  const { withItems = false, limit = DEFAULT_LIMIT, onFetchError } = options
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<UserNotificationRow[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      let query = supabase
        .from('user_notifications')
        .select(withItems ? '*' : 'id', { count: 'exact', head: !withItems })
        .eq('user_id', userId)
        .is('read_at', null)
        .order('created_at', { ascending: false })

      if (withItems) {
        query = query.limit(limit)
      }

      const { data, error, count } = await query

      if (error) throw error
      setUnreadCount(count ?? (withItems ? (data?.length ?? 0) : 0))
      if (withItems) {
        setItems((data ?? []) as UserNotificationRow[])
      }
    } catch (e) {
      const msg =
        (e as { message?: string })?.message ||
        'No se pudieron cargar las notificaciones'
      onFetchError?.(msg)
      setUnreadCount(0)
      if (withItems) setItems([])
    } finally {
      setLoading(false)
    }
  }, [supabase, userId, withItems, limit, onFetchError])

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
    if (!userId) {
      setUnreadCount(0)
      setItems([])
      return
    }
    void refresh()
  }, [userId, refresh])

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
          void refresh()
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
          void refresh()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, userId, refresh])

  useEffect(() => {
    if (!userId) return
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [userId, refresh])

  return { userId, unreadCount, items, loading, refresh, supabase }
}
