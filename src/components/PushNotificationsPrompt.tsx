'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, X } from 'lucide-react'
import { toast } from 'sonner'
import { getPushSubscriptionStatus, saveSubscription } from '@/app/actions/notifications'
import { cn } from '@/lib/utils'
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
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { normalizeNotificationEmail } from '@/lib/notification-recipients'

interface PushNotificationsPromptProps {
  isLoggedIn: boolean
  needsOnboarding: boolean
  userEmail: string | null
}

function isForcedPreviewUser(userEmail: string | null): boolean {
  if (!PUSH_PROMPT_FORCE_PREVIEW) return false
  return normalizeNotificationEmail(userEmail) === PUSH_PROMPT_PREVIEW_EMAIL
}

export function PushNotificationsPrompt({
  isLoggedIn,
  needsOnboarding,
  userEmail,
}: PushNotificationsPromptProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [mounted, setMounted] = useState(false)
  const forcedPreview = isForcedPreviewUser(userEmail)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isLoggedIn || needsOnboarding) return
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
  }, [isLoggedIn, needsOnboarding, forcedPreview])

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

  if (!mounted || !open) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[250] flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-prompt-title"
    >
      <div
        className={cn(
          'bg-white w-full max-w-md rounded-3xl shadow-xl border border-zinc-100 overflow-hidden',
          'animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-[#36606F] text-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Bell size={22} strokeWidth={2.5} />
            </div>
            <h2
              id="push-prompt-title"
              className="text-base font-black uppercase tracking-wider truncate"
            >
              {PUSH_PROMPT_COPY.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white/80 hover:bg-white/20 transition-colors active:scale-95"
            aria-label="Cerrar"
          >
            <X size={22} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm text-zinc-600 leading-relaxed">{PUSH_PROMPT_COPY.lead}</p>

          {permissionDenied ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 leading-relaxed">
              {PUSH_PROMPT_COPY.deniedHint}
            </p>
          ) : null}

          <div className="shrink-0 flex flex-col gap-3 pt-1">
            <button
              type="button"
              onClick={() => void handleActivate()}
              disabled={loading}
              className={cn(
                'w-full min-h-[48px] rounded-xl font-black uppercase tracking-wider text-sm',
                'bg-[#36606F] text-white shadow-sm active:scale-[0.98] transition-transform',
                'disabled:opacity-60 disabled:pointer-events-none',
              )}
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <LoadingSpinner className="w-4 h-4 border-white/30 border-t-white" />
                  Activando…
                </span>
              ) : (
                PUSH_PROMPT_COPY.activateLabel
              )}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={loading}
              className="w-full min-h-[48px] rounded-xl font-bold text-sm text-zinc-500 hover:bg-zinc-50 active:scale-[0.98] transition-transform"
            >
              {PUSH_PROMPT_COPY.dismissLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
