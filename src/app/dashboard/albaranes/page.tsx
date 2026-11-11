import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { listPurchaseInvoicesDefaultWeekAction } from './actions'
import AlbaranesHistoricoClient from './AlbaranesHistoricoClient'

export const dynamic = 'force-dynamic'

export default async function AlbaranesHistoricoPage() {
  const supabase = await createClient()
  // Misma decisión que proxy.ts y gateAuthenticated: consultar la sesión
  // desde cookies sin bloquear SSR con un getUser() remoto.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  // Esperar a la consulta sin cortar artificialmente el SSR.
  // Un error real se sigue mostrando en la interfaz.
  let role: string | null = null
  try {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    role = (data?.role as string | null) ?? null
  } catch {
    role = null
  }
  const isManager = role === 'manager' || role === 'admin'

  const res = await listPurchaseInvoicesDefaultWeekAction().catch((error: unknown) => ({
    success: false as const,
    message: error instanceof Error ? error.message : 'Error inesperado al listar albaranes',
  }))

  // El layout (cabecera "Albaranes" y slot derecho) se monta dentro del cliente
  // para poder pasar como rightSlot filtro / Refresh.
  return (
    <AlbaranesHistoricoClient
      initialItems={res.success ? res.items : []}
      initialHasMore={res.success ? res.hasMore : false}
      initialError={res.success ? null : res.message}
      isManager={isManager}
    />
  )
}
