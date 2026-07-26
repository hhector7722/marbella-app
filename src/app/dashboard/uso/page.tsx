import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Globe, Smartphone } from 'lucide-react'
import { UsageDashboard } from '@/components/usage/UsageDashboard'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import { Button, PageActions, PageHeader } from '@/components/mds'
import { canAccessUsageAnalytics } from '@/lib/usage/access'
import {
  getUsageDashboardData,
  parseUsageDashboardFilters,
} from '@/lib/usage/queries'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

type UsoPageProps = {
  searchParams: Promise<{ dia?: string; usuario?: string; usuarios?: string }>
}

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'master', label: 'Master', href: '/master/dashboard' },
  { id: 'uso', label: 'Uso app' },
]

export default async function UsoPage({ searchParams }: UsoPageProps) {
  const params = await searchParams
  const filters = parseUsageDashboardFilters(params)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, first_name')
    .eq('id', user.id)
    .maybeSingle()

  const email = profile?.email ?? user.email ?? ''
  if (!canAccessUsageAnalytics(email)) {
    redirect('/dashboard')
  }

  const data = await getUsageDashboardData(filters)

  return (
    <V2PageShell
      variant="manager"
      breadcrumbs={BREADCRUMBS}
      user={{
        id: user.id,
        name: profile?.first_name?.trim() || 'Manager',
        email: email || undefined,
        roleLabel: 'Manager',
      }}
    >
      <PageHeader
        title="Uso de la app"
        description="Actividad de usuarios en la aplicación (día y filtros)."
        actions={
          <PageActions>
            <Button variant="icon" asChild>
              <Link href="/dashboard/web" aria-label="Uso web">
                <Globe className="size-5" strokeWidth={1.5} aria-hidden />
              </Link>
            </Button>
            <Button variant="icon" asChild>
              <Link
                href="/dashboard/instalacion-app"
                aria-label="Instalación de la app"
              >
                <Smartphone className="size-5" strokeWidth={1.5} aria-hidden />
              </Link>
            </Button>
          </PageActions>
        }
      />
      <UsageDashboard data={data} />
    </V2PageShell>
  )
}
