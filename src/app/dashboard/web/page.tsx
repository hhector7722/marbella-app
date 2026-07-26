import { redirect } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { WebAnalyticsDashboard } from '@/components/web-analytics/WebAnalyticsDashboard'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import { Alert, Button, PageActions, PageHeader } from '@/components/mds'
import { canAccessWebAnalytics } from '@/lib/web-analytics/access'
import {
  createEmptyWebAnalyticsDashboardData,
  getWebAnalyticsDashboardData,
  parseWebAnalyticsFilters,
} from '@/lib/web-analytics/queries'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

type WebAnalyticsPageProps = {
  searchParams: Promise<{ dia?: string }>
}

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'master', label: 'Master', href: '/master/dashboard' },
  { id: 'web', label: 'Analítica web' },
]

export default async function WebAnalyticsPage({
  searchParams,
}: WebAnalyticsPageProps) {
  const params = await searchParams
  const filters = parseWebAnalyticsFilters(params)

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
  if (!canAccessWebAnalytics(email)) {
    redirect('/dashboard')
  }

  let data = createEmptyWebAnalyticsDashboardData(filters)
  let loadError: string | null = null

  try {
    data = await getWebAnalyticsDashboardData(filters)
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : 'No se pudieron cargar los datos de analítica web.'
  }

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
        title="Analítica web"
        description="Visitas, navegación y clics en marbella-web"
        actions={
          <PageActions>
            <Button variant="outline" asChild>
              <a
                href="https://marbella-web.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-4" aria-hidden />
                Abrir web
              </a>
            </Button>
          </PageActions>
        }
      />

      {loadError ? (
        <Alert
          tone="danger"
          title="No se pudo cargar la analítica web"
          description={loadError}
        />
      ) : null}

      <WebAnalyticsDashboard data={data} />
    </V2PageShell>
  )
}
