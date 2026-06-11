'use client'

import { useEffect } from 'react'
import { reportClientDisplayMode } from '@/app/actions/client-display-mode'
import { isStandalonePWA } from '@/lib/push-notifications-client'

interface ClientDisplayModeReporterProps {
  isLoggedIn: boolean
}

export function ClientDisplayModeReporter({ isLoggedIn }: ClientDisplayModeReporterProps) {
  useEffect(() => {
    if (!isLoggedIn) return

    const send = () => {
      const mode = isStandalonePWA() ? 'standalone' : 'browser'
      void reportClientDisplayMode(mode)
    }

    send()

    const media = window.matchMedia('(display-mode: standalone)')
    const onChange = () => send()
    media.addEventListener('change', onChange)

    return () => media.removeEventListener('change', onChange)
  }, [isLoggedIn])

  return null
}
