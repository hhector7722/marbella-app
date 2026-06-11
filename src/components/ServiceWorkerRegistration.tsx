'use client'

import { useEffect } from 'react'
import { saveSubscription } from '@/app/actions/notifications'
import {
  ensureServiceWorkerRegistered,
  isPushSupported,
} from '@/lib/push-notifications-client'

/** Registra el SW y sincroniza suscripciones ya concedidas (sin pedir permiso automáticamente). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!isPushSupported()) return
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return

    void (async () => {
      const registration = await ensureServiceWorkerRegistered()
      if (!registration) return

      if (Notification.permission !== 'granted') return

      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) return

      const res = await saveSubscription(JSON.parse(JSON.stringify(subscription)))
      if (res?.error) {
        console.error('Error saving push subscription:', res.error)
      }
    })()
  }, [])

  return null
}
