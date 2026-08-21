'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'
import { getPushSubscriptionStatus, saveSubscription } from '@/app/actions/notifications'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import {
  PUSH_PROMPT_COPY,
  PUSH_PROMPT_FORCE_PREVIEW,
  PUSH_PROMPT_PREVIEW_EMAIL,
} from '@/lib/push-notifications-copy'
import {
  isPushSupported,
  isStandalonePWA,
  PUSH_PROMPT_DISMISS_KEY,
  subscribeAndGetPushSubscription,
} from '@/lib/push-notifications-client'
import { normalizeNotificationEmail } from '@/lib/notification-recipients'
import { createClient } from '@/utils/supabase/client'

function isForcedPreviewUser(userEmail: string | null): boolean {
  if (!PUSH_PROMPT_FORCE_PREVIEW) return false
  return normalizeNotificationEmail(userEmail) === PUSH_PROMPT_PREVIEW_EMAIL
}

/** Prompt push: sesión en cliente para no bloquear el layout SSR. */
export function PushNotificationsPrompt() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const forcedPreview = isForcedPreviewUser(userEmail)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setIsLoggedIn(!!data.session?.user)
      setUserEmail(data.session?.user?.email ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user)
      setUserEmail(session?.user?.email ?? null)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isLoggedIn) return
    if (!isPushSupported()) return
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return

    if (forcedPreview) {
      setPermissionDenied(
        typeof Notification !== 'undefined' && Notification.permission === 'denied',
      )
      setOpen(true)
      return
    }

    if (!isStandalonePWA()) return

    if (sessionStorage.getItem(PUSH_PROMPT_DISMISS_KEY) === '1') return

    let cancelled = false

    void (async () => {
      const { hasSubscription } = await getPushSubscriptionStatus()
      if (cancelled) return
      if (!hasSubscription) {
        setPermissionDenied(
          typeof Notification !== 'undefined' && Notification.permission === 'denied',
        )
        setOpen(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isLoggedIn, forcedPreview])

  const handleDismiss = useCallback(() => {
    if (!forcedPreview) {
      sessionStorage.setItem(PUSH_PROMPT_DISMISS_KEY, '1')
    }
    setOpen(false)
  }, [forcedPreview])

  const handleActivate = useCallback(async () => {
    setLoading(true)
    try {
      const subscription = await subscribeAndGetPushSubscription()
      if (!subscription) {
        setPermissionDenied(Notification.permission === 'denied')
        if (Notification.permission === 'denied') {
          toast.error(PUSH_PROMPT_COPY.deniedHint)
        } else {
          toast.error('No se pudieron activar las notificaciones en este dispositivo.')
        }
        return
      }

      if (!forcedPreview) {
        const res = await saveSubscription(JSON.parse(JSON.stringify(subscription)))
        if (res?.error) {
          toast.error(`No se pudo guardar la suscripción: ${res.error}`)
          return
        }
        sessionStorage.removeItem(PUSH_PROMPT_DISMISS_KEY)
      }

      toast.success(PUSH_PROMPT_COPY.successToast)
      setOpen(false)
    } catch {
      toast.error('Error al activar notificaciones.')
    } finally {
      setLoading(false)
    }
  }, [forcedPreview])

  if (!mounted) return null

  return (
    <Modal
      open={open}
      onClose={handleDismiss}
      title={PUSH_PROMPT_COPY.title}
      variant="compact"
      layer="system"
      instance="push-notifications-prompt"
      headerTone="petroleum"
      headerTrailing={
        <Bell size={22} strokeWidth={2.5} className="shrink-0 text-white" aria-hidden />
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-zinc-600 leading-relaxed">{PUSH_PROMPT_COPY.lead}</p>

        {permissionDenied ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 leading-relaxed">
            {PUSH_PROMPT_COPY.deniedHint}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="primary"
            instance="push-notifications-activate"
            disabled={loading}
            loading={loading}
            loadingLabel="Activando…"
            onClick={() => void handleActivate()}
          >
            {PUSH_PROMPT_COPY.activateLabel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            instance="push-notifications-dismiss"
            disabled={loading}
            onClick={handleDismiss}
          >
            {PUSH_PROMPT_COPY.dismissLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
