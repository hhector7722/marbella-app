'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Bell, BellOff, Globe, HelpCircle, Smartphone } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  fetchTeamClientInstallStatus,
  type TeamClientInstallRow,
} from '@/app/actions/client-display-mode'
import {
  Button,
  EmptyState,
  List,
  ListActions,
  ListItem,
  LoadingBlock,
  Metric,
  PageActions,
  PageHeader,
  Section,
  Status,
  Text,
} from '@/components/mds'

function formatSeenAt(iso: string | null): string {
  if (!iso) return ' '
  try {
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return ' '
  }
}

function ModeStatus({ mode }: { mode: TeamClientInstallRow['last_display_mode'] }) {
  if (mode === 'standalone') {
    return (
      <Status.Success className="gap-1.5">
        <Smartphone className="size-3.5" aria-hidden />
        App instalada
      </Status.Success>
    )
  }
  if (mode === 'browser') {
    return (
      <Status.Warning className="gap-1.5">
        <Globe className="size-3.5" aria-hidden />
        Navegador
      </Status.Warning>
    )
  }
  return (
    <Status.Neutral className="gap-1.5">
      <HelpCircle className="size-3.5" aria-hidden />
      Sin datos
    </Status.Neutral>
  )
}

export default function AppInstallStatusClient() {
  const [rows, setRows] = useState<TeamClientInstallRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const result = await fetchTeamClientInstallStatus()
      if (cancelled) return
      if (result.error) {
        toast.error(`No se pudo cargar el informe: ${result.error}`)
        setLoading(false)
        return
      }
      setRows(result.rows)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const browserOnly = rows.filter((r) => r.last_display_mode === 'browser')
  const noData = rows.filter((r) => !r.last_display_mode)
  const appInstalled = rows.filter((r) => r.last_display_mode === 'standalone')

  return (
    <>
      <PageHeader
        title="Instalación app"
        description="Quién abre la app instalada vs navegador (última visita)"
        actions={
          <PageActions>
            <Button variant="outline" asChild>
              <Link href="/master/dashboard">
                <ArrowLeft className="size-4" aria-hidden />
                Volver
              </Link>
            </Button>
          </PageActions>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-busy="true">
          <LoadingBlock lines={2} />
          <LoadingBlock lines={2} />
          <LoadingBlock lines={2} />
        </div>
      ) : (
        <>
          <Section
            id="install-metrics"
            title="Resumen"
            description="Conteo por modo de visualización."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Metric
                title="Navegador"
                value={browserOnly.length}
                empty={browserOnly.length === 0}
                trend={{ label: 'Última visita en browser', tone: 'warning' }}
                icon={Globe}
              />
              <Metric
                title="Sin datos"
                value={noData.length}
                empty={noData.length === 0}
                trend={{ label: 'Aún no reportado', tone: 'muted' }}
                icon={HelpCircle}
              />
              <Metric
                title="App"
                value={appInstalled.length}
                empty={appInstalled.length === 0}
                trend={{ label: 'Standalone / PWA', tone: 'success' }}
                icon={Smartphone}
              />
            </div>
          </Section>

          <Section id="install-team" title="Equipo" description="Estado por persona.">
            {rows.length === 0 ? (
              <EmptyState
                icon={Smartphone}
                title="Sin miembros"
                description="No hay perfiles de equipo para mostrar."
              />
            ) : (
              <List>
                {rows.map((row) => {
                  const name = row.full_name?.trim() || row.email || ' '
                  return (
                    <ListItem key={row.user_id} className="flex-col items-stretch sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <Text as="p" variant="body" className="truncate font-bold">
                          {name}
                        </Text>
                        <Text as="p" variant="body" muted className="truncate text-xs">
                          {row.email ?? ' '}
                        </Text>
                      </div>
                      <ListActions className="mt-2 w-full flex-wrap justify-start sm:mt-0 sm:w-auto sm:justify-end">
                        <ModeStatus mode={row.last_display_mode} />
                        <Status
                          tone={row.has_push ? 'success' : 'neutral'}
                          className="gap-1"
                        >
                          {row.has_push ? (
                            <Bell className="size-3.5" aria-hidden />
                          ) : (
                            <BellOff className="size-3.5" aria-hidden />
                          )}
                          {row.has_push ? 'Push activo' : 'Sin push'}
                        </Status>
                        <Text
                          as="span"
                          variant="caption"
                          className="w-full tabular-nums normal-case tracking-normal sm:w-auto sm:text-right"
                        >
                          {formatSeenAt(row.last_display_mode_at)}
                        </Text>
                      </ListActions>
                    </ListItem>
                  )
                })}
              </List>
            )}
          </Section>
        </>
      )}
    </>
  )
}
