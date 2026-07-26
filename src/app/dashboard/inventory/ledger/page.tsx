import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import { Button, PageActions, PageHeader } from '@/components/mds'
import { LedgerClient } from './LedgerClient'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'inventory', label: 'Inventario', href: '/dashboard/inventory' },
  { id: 'ledger', label: 'Stock' },
]

export default async function LedgerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, email')
    .eq('id', user.id)
    .maybeSingle()

  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select('id, name, unit, stock_current, category, image_url, order_unit')
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error('Fallo al cargar base de inventario')

  const role = profile?.role ?? null
  const roleLabel =
    role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Staff'

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
      <PageHeader
        title="Stock"
        description="Historial de movimientos y trazabilidad por ingrediente."
        actions={
          <PageActions>
            <Button variant="outline" asChild>
              <Link href="/dashboard/recetas-tpv">
                <BookOpen className="size-4" strokeWidth={2.5} aria-hidden />
                Mapeo TPV
              </Link>
            </Button>
          </PageActions>
        }
      />
      <LedgerClient ingredients={ingredients || []} />
    </V2PageShell>
  )
}
