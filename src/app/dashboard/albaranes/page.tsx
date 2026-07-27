import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import { listPurchaseInvoicesDefaultWeekAction } from './actions'
import AlbaranesHistoricoClient from './AlbaranesHistoricoClient'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'albaranes', label: 'Albaranes' },
]

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
  const profilePromise: Promise<{
    role: string | null
    first_name: string | null
    email: string | null
  } | null> = (async () => {
    try {
      const r = await supabase
        .from('profiles')
        .select('role, first_name, email')
        .eq('id', user.id)
        .maybeSingle()
      if (!r.data) return null
      return {
        role: (r.data.role as string | null) ?? null,
        first_name: (r.data.first_name as string | null) ?? null,
        email: (r.data.email as string | null) ?? null,
      }
    } catch {
      return null
    }
  })()

  const profile = await ssrWithTimeout(profilePromise, 6000, null)
  const role = profile?.role ?? null
  const isManager = role === 'manager' || role === 'admin'
  const roleLabel =
    role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Staff'

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

  // Cabecera MDS + acciones Sparkles/Refresh viven en el cliente (estado interno).
  return (
    <V2PageShell
      variant="manager"
      breadcrumbs={BREADCRUMBS}
      user={{
        id: user.id,
        name: profile?.first_name?.trim() || roleLabel,
        email: profile?.email ?? user.email ?? undefined,
        roleLabel,
      }}
    >
      <AlbaranesHistoricoClient
        initialItems={res.success ? res.items : []}
        initialError={res.success ? null : res.message}
        isManager={isManager}
      />
    </V2PageShell>
  )
}
