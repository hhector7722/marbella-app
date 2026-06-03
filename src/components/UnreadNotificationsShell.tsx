'use client'

import type { ReactNode } from 'react'

import { AppIconBadgeSync } from '@/components/AppIconBadgeSync'
import { UnreadNotificationsProvider } from '@/contexts/UnreadNotificationsContext'

export function UnreadNotificationsShell({ children }: { children: ReactNode }) {
  return (
    <UnreadNotificationsProvider>
      <AppIconBadgeSync />
      {children}
    </UnreadNotificationsProvider>
  )
}
