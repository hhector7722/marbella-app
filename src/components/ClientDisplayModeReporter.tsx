'use client'

import { useEffect } from 'react'
import { reportClientDisplayMode } from '@/app/actions/client-display-mode'
import { isStandalonePWA } from '@/lib/push-notifications-client'
import { createClient } from '@/utils/supabase/client'

/** Reporta display-mode tras resolver sesión en cliente (no bloquea SSR). */
export function ClientDisplayModeReporter() {
  useEffect(() => {
    let cancelled = false
    let removeMediaListener: (() => void) | null = null
    const supabase = createClient()

    const send = () => {
      const mode = isStandalonePWA() ? 'standalone' : 'browser'
      void reportClientDisplayMode(mode)
    }

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled || !data.session?.user) return

      send()

      const media = window.matchMedia('(display-mode: standalone)')
      const onChange = () => send()
      media.addEventListener('change', onChange)
      removeMediaListener = () => media.removeEventListener('change', onChange)
    })()

    return () => {
      cancelled = true
      removeMediaListener?.()
    }
  }, [])

  return null
}
