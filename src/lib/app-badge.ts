/**
 * Contador en el icono de la app (PWA / «Añadir a inicio»).
 * Badging API: Chrome/Android, Edge, Safari iOS 16.4+ (web app en pantalla de inicio).
 */

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

type BadgeRegistration = ServiceWorkerRegistration & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

export function isAppIconBadgeSupported(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as BadgeNavigator
  if (typeof nav.setAppBadge === 'function') return true
  if (!('serviceWorker' in navigator)) return false
  return true
}

export async function syncAppIconBadge(count: number): Promise<void> {
  if (typeof window === 'undefined') return

  const n = Math.max(0, Math.floor(count))
  const nav = navigator as BadgeNavigator

  try {
    if (n === 0) {
      if (typeof nav.clearAppBadge === 'function') {
        await nav.clearAppBadge()
      }
      if ('serviceWorker' in navigator) {
        const reg = (await navigator.serviceWorker.ready) as BadgeRegistration
        if (typeof reg.clearAppBadge === 'function') {
          await reg.clearAppBadge()
        }
      }
      return
    }

    const capped = Math.min(n, 99)

    if (typeof nav.setAppBadge === 'function') {
      await nav.setAppBadge(capped)
      return
    }

    if ('serviceWorker' in navigator) {
      const reg = (await navigator.serviceWorker.ready) as BadgeRegistration
      if (typeof reg.setAppBadge === 'function') {
        await reg.setAppBadge(capped)
      }
    }
  } catch {
    // Navegador sin soporte o contexto no instalado — no bloquear la app
  }
}
