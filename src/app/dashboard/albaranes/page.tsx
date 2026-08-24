import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getDefaultPurchaseInvoicesDateRange } from '@/lib/albaranes/purchase-invoices-list'
import { listPurchaseInvoicesDefaultWeekAction } from './actions'
import AlbaranesHistoricoClient from './AlbaranesHistoricoClient'

export const dynamic = 'force-dynamic'

/**
 * Aplica un timeout a una promesa SSR. Si la promesa no resuelve en `ms`
 * milisegundos, resolvemos con `fallback` en lugar de dejar la página
 * cargando "para siempre". Es la última red de seguridad ante hangs
 * intermitentes de la edge (Auth / PostgREST). Anti-silent-failures:
 * el error queda visible en la UI como banner rojo, no se silencia.
 */
async function ssrWithTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), ms)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export default async function AlbaranesHistoricoPage() {
  const supabase = await createClient()
  // Misma decisión que `proxy.ts` y `gateAuthenticated`: `getSession()`
  // desde cookies — no bloquea el SSR en un `getUser()` colgado contra GoTrue.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  // Defensa contra hangs: si profile/lista tardan >8s nos rendimos y
  // renderizamos el cliente con error visible, en lugar de colgar el SSR.
  // El builder de Supabase es `PromiseLike`, lo envolvemos en Promise para
  // habilitar `.catch()` y poder componer con `Promise.race`.
  const profilePromise: Promise<string | null> = (async () => {
    try {
      const r = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      return (r.data?.role as string | null) ?? null
    } catch {
      return null
    }
  })()

  const role = await ssrWithTimeout<string | null>(profilePromise, 6000, null)
  const isManager = role === 'manager' || role === 'admin'

  const listFallback = {
    success: false as const,
    message: 'Tiempo de espera agotado al cargar los albaranes. Recarga la página.',
  }
  const listGuarded: Promise<Awaited<ReturnType<typeof listPurchaseInvoicesDefaultWeekAction>>> = (async () => {
    try {
      return await listPurchaseInvoicesDefaultWeekAction()
    } catch (e: unknown) {
      return {
        success: false as const,
        message: e instanceof Error ? e.message : 'Error inesperado al listar albaranes',
      }
    }
  })()
  const res = await ssrWithTimeout(listGuarded, 8000, listFallback)
  const defaultRange = getDefaultPurchaseInvoicesDateRange()

  // El layout (cabecera "Albaranes" + slot derecho) se monta dentro del cliente
  // para poder pasar como rightSlot los botones Sparkles/Refresh que dependen
  // de su estado interno (autoMapLoading, isPending, runAutoMap, refresh).
  return (
    <AlbaranesHistoricoClient
      initialItems={res.success ? res.items : []}
      initialHasMore={res.success ? res.hasMore : false}
      defaultDateFrom={res.success ? res.weekStart : defaultRange.dateFrom}
      defaultDateTo={res.success ? res.weekEnd : defaultRange.dateTo}
      initialError={res.success ? null : res.message}
      isManager={isManager}
    />
  )
}

