'use client'

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { toast } from 'sonner'

import { useUnreadNotificationCount } from '@/hooks/useUnreadNotificationCount'
import type { UserNotificationRow } from '@/lib/user-notifications'
import { RESERVATION_CENTER_NOTIFICATION_TYPES } from '@/lib/user-notifications'
import { createClient } from '@/utils/supabase/client'

type SupabaseClient = ReturnType<typeof createClient>

type UnreadNotificationsContextValue = {
  userId: string | null
  unreadCount: number
  items: UserNotificationRow[]
  loading: boolean
  refresh: () => Promise<void>
  supabase: SupabaseClient
}

const UnreadNotificationsContext = createContext<UnreadNotificationsContextValue | null>(
  null
)

export function UnreadNotificationsProvider({ children }: { children: ReactNode }) {
  const handleFetchError = useCallback((message: string) => {
    toast.error(message)
  }, [])

  const { userId, unreadCount, items, loading, refresh, supabase } =
    useUnreadNotificationCount({
      withItems: true,
      excludeTypes: RESERVATION_CENTER_NOTIFICATION_TYPES,
      onFetchError: handleFetchError,
    })

  const value = useMemo(
    () => ({ userId, unreadCount, items, loading, refresh, supabase }),
    [userId, unreadCount, items, loading, refresh, supabase]
  )

  return (
    <UnreadNotificationsContext.Provider value={value}>
      {children}
    </UnreadNotificationsContext.Provider>
  )
}

export function useUnreadNotifications() {
  const ctx = useContext(UnreadNotificationsContext)
  if (!ctx) {
    throw new Error('useUnreadNotifications debe usarse dentro de UnreadNotificationsProvider')
  }
  return ctx
}
