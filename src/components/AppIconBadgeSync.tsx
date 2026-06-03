'use client'

import { useEffect } from 'react'

import { syncAppIconBadge } from '@/lib/app-badge'
import { useUnreadNotifications } from '@/contexts/UnreadNotificationsContext'

/** Sincroniza el número en el icono de la PWA (pantalla de inicio). */
export function AppIconBadgeSync() {
  const { userId, unreadCount } = useUnreadNotifications()

  useEffect(() => {
    void syncAppIconBadge(userId ? unreadCount : 0)
  }, [userId, unreadCount])

  return null
}
