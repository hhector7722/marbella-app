'use client'

import { useEffect, useState } from 'react'
import { Smartphone, Globe, HelpCircle, Bell, BellOff } from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchTeamClientInstallStatus,
  type TeamClientInstallRow,
} from '@/app/actions/client-display-mode'
import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

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

function ModeBadge({ mode }: { mode: TeamClientInstallRow['last_display_mode'] }) {
  if (mode === 'standalone') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100 px-2.5 py-1 text-xs font-bold">
        <Smartphone size={14} aria-hidden />
        App instalada
      </span>
    )
  }
  if (mode === 'browser') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-900 border border-amber-100 px-2.5 py-1 text-xs font-bold">
        <Globe size={14} aria-hidden />
        Navegador
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-50 text-zinc-500 border border-zinc-100 px-2.5 py-1 text-xs font-bold">
      <HelpCircle size={14} aria-hidden />
      Sin datos
    </span>
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

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 grid grid-cols-3 gap-2 p-4 border-b border-zinc-100 bg-zinc-50/80">
        <div className="rounded-xl bg-white border border-zinc-100 p-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Navegador</p>
          <p className="text-xl font-black text-amber-700 tabular-nums">{browserOnly.length || ' '}</p>
        </div>
        <div className="rounded-xl bg-white border border-zinc-100 p-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Sin datos</p>
          <p className="text-xl font-black text-zinc-500 tabular-nums">{noData.length || ' '}</p>
        </div>
        <div className="rounded-xl bg-white border border-zinc-100 p-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">App</p>
          <p className="text-xl font-black text-emerald-700 tabular-nums">{appInstalled.length || ' '}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {rows.map((row) => (
          <div
            key={row.user_id}
            className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-bold text-zinc-900 truncate">
                {row.full_name?.trim() || row.email || ' '}
              </p>
              <p className="text-xs text-zinc-400 truncate">{row.email ?? ' '}</p>
            </div>
            <div className="shrink-0 flex flex-wrap items-center gap-2 sm:justify-end">
              <ModeBadge mode={row.last_display_mode} />
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-xs font-semibold',
                  row.has_push ? 'text-emerald-700' : 'text-zinc-400',
                )}
              >
                {row.has_push ? <Bell size={14} aria-hidden /> : <BellOff size={14} aria-hidden />}
                {row.has_push ? 'Push activo' : 'Sin push'}
              </span>
              <span className="text-[10px] text-zinc-400 tabular-nums w-full sm:w-auto sm:text-right">
                {formatSeenAt(row.last_display_mode_at)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
