'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { UserNotificationRow } from '@/lib/user-notifications'
import { createClient } from '@/utils/supabase/client'

const DEFAULT_LIMIT = 30
/** Tras un fallo de red, no reintentar automáticamente hasta pasar este tiempo (evita bucles de toast/fetch). */
const FETCH_ERROR_COOLDOWN_MS = 30_000

type Options = {
  /** Si true, carga filas para el panel (máx. limit). Si false, solo el contador. */
  withItems?: boolean
  limit?: number
  onFetchError?: (message: string) => void
}

export function useUnreadNotificationCount(options: Options = {}) {
  const { withItems = false, limit = DEFAULT_LIMIT, onFetchError } = options
  const onFetchErrorRef = useRef(onFetchError)
  onFetchErrorRef.current = onFetchError

  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<UserNotificationRow[]>([])
  const [loading, setLoading] = useState(false)
  const lastFetchErrorAtRef = useRef(0)

  const refresh = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!userId) return
      const force = opts?.force === true
      if (
        !force &&
        lastFetchErrorAtRef.current > 0 &&
        Date.now() - lastFetchErrorAtRef.current < FETCH_ERROR_COOLDOWN_MS
      ) {
        return
      }

      setLoading(true)
      try {
        // Incluye reservation_new + client_order_submitted (mismo centro que reservas)
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
        lastFetchErrorAtRef.current = 0
        setUnreadCount(count ?? (withItems ? (data?.length ?? 0) : 0))
        if (withItems) {
          setItems((data ?? []) as UserNotificationRow[])
        }
      } catch (e) {
        lastFetchErrorAtRef.current = Date.now()
        const msg =
          (e as { message?: string })?.message ||
          'No se pudieron cargar las notificaciones'
        onFetchErrorRef.current?.(msg)
        setUnreadCount(0)
        if (withItems) setItems([])
      } finally {
        setLoading(false)
      }
    },
    [supabase, userId, withItems, limit]
  )

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0)
      setItems([])
      lastFetchErrorAtRef.current = 0
      return
    }
    void refreshRef.current()
  }, [userId])

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
          void refreshRef.current()
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
          void refreshRef.current()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  useEffect(() => {
    if (!userId) return
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshRef.current()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [userId])

  const refreshStable = useCallback(
    () => refreshRef.current({ force: true }),
    []
  )

  return { userId, unreadCount, items, loading, refresh: refreshStable, supabase }
}
