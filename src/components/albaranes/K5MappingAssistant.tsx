'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/Notice'
import { Surface } from '@/components/ui/Surface'
import {
  applyK5MappingAssistantAction,
  listK5MappingAssistantAction,
  type K5MappingAssistantState,
} from '@/app/dashboard/albaranes/k5/mapping-assistant-actions'

type Props = { invoiceId: string; onResolveLine?: (lineId: string) => void }

function formatQty(value: number, unit: string): string {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(value)} ${unit}`
}

export function K5MappingAssistant({ invoiceId, onResolveLine }: Props) {
  const [state, setState] = useState<K5MappingAssistantState | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listK5MappingAssistantAction({ invoiceId })
      if (!result.success) {
        setError(result.message)
        return
      }
      setState(result.state)
      setSelected(new Set(result.state.suggestions.map((item) => item.fingerprint)))
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    void load()
  }, [load])

  const allSelected = useMemo(
    () => Boolean(state?.suggestions.length) && state!.suggestions.every((item) => selected.has(item.fingerprint)),
    [state, selected]
  )

  function toggle(fingerprint: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(fingerprint)) next.delete(fingerprint)
      else next.add(fingerprint)
      return next
    })
  }

  async function handleSave() {
    if (selected.size === 0) {
      toast.error('Selecciona al menos un mapping sugerido.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await applyK5MappingAssistantAction({
        invoiceId,
        fingerprints: [...selected],
      })
      if (!result.success) {
        setError(result.message)
        toast.error(result.message)
        await load()
        return
      }
      toast.success(`${result.applied} mapping(s) guardados. No se ha aplicado stock ni precio.`)
      window.location.reload()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Surface variant="block" instance="k5-mapping-assistant-loading" className="p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Buscando mappings reutilizables…
        </div>
      </Surface>
    )
  }

  if (!state) {
    return (
      <Notice instance="k5-mapping-assistant-error" variant="negative" title="No se pudo preparar el asistente de mappings">
        {error || 'No hay información disponible.'}
      </Notice>
    )
  }

  if (state.suggestions.length === 0 && state.unresolved.length === 0) {
    return (
      <Surface variant="block" instance="k5-mapping-assistant-complete" className="min-w-0 p-4">
        <div className="flex items-center gap-2 text-sm font-black text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          1 · No hay productos nuevos que resolver
        </div>
        <p className="mt-1 text-[11px] font-medium text-zinc-600">
          Todos los productos tienen ya un mapping utilizable o están tratados en la revisión de abajo.
        </p>
      </Surface>
    )
  }

  return (
    <Surface variant="block" instance="k5-mapping-assistant" className="min-w-0 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-black text-zinc-900">
            <WandSparkles className="h-4 w-4" />
            1 · Resolver productos nuevos o dudosos
          </div>
          <p className="mt-1 max-w-3xl text-xs font-medium leading-relaxed text-zinc-600">
            Aquí decides solo los productos que K5 no puede resolver por sí solo. Las coincidencias seguras se pueden aceptar juntas; las dudosas se mapean una a una.
          </p>
        </div>
        <Button
          type="button"
          variant="tertiary"
          instance="k5-mapping-assistant-refresh"
          onClick={() => void load()}
          disabled={saving}
        >
          <RefreshCw className="h-4 w-4" />
          Recargar
        </Button>
      </div>

      {error ? (
        <div className="mt-3">
          <Notice instance="k5-mapping-assistant-inline-error" variant="negative" title="Asistente detenido">
            {error}
          </Notice>
        </div>
      ) : null}

      {state.suggestions.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
              Coincidencias listas para aceptar · {state.suggestions.length}
            </div>
            <button
              type="button"
              className="text-[10px] font-black text-zinc-600 underline underline-offset-2"
              onClick={() => setSelected(new Set(allSelected ? [] : state.suggestions.map((item) => item.fingerprint)))}
            >
              {allSelected ? 'Deseleccionar todas' : 'Seleccionar todas'}
            </button>
          </div>

          <div className="space-y-1.5">
            {state.suggestions.map((item) => (
              <label key={item.fingerprint} className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/45 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(item.fingerprint)}
                  onChange={() => toggle(item.fingerprint)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black text-zinc-900">{item.sourceItemName}</div>
                  <div className="mt-0.5 text-[10px] font-semibold text-zinc-600">
                    → {item.ingredientName} · {item.lineBillingUnit} · contenido {formatQty(item.lineContentQty, item.lineContentUnit)}
                  </div>
                  <div className="mt-1 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                    {item.source === 'legacy_validated' ? 'Diccionario histórico validado' : 'Coincidencia clara con catálogo'} · score {Math.round(item.score)}
                  </div>
                  {item.note ? <div className="mt-1 text-[10px] font-semibold text-amber-800">{item.note}</div> : null}
                </div>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              </label>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-semibold text-zinc-500">
              Después de guardarlos, las líneas compatibles pasarán a la revisión económica por lote.
            </div>
            <Button
              type="button"
              variant="primary"
              instance="k5-mapping-assistant-save"
              onClick={() => void handleSave()}
              disabled={saving || selected.size === 0}
              loading={saving}
              loadingLabel="Guardando…"
            >
              Aceptar {selected.size} coincidencia{selected.size === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      ) : null}

      {state.unresolved.length > 0 ? (
        <div className="mt-4 border-t border-zinc-200 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              Necesitan una decisión · {state.unresolved.length}
            </div>
            <Link href={`/dashboard/albaranes?id=${encodeURIComponent(invoiceId)}`} className="text-[10px] font-black text-zinc-700 underline underline-offset-2">
              Abrir albarán completo
            </Link>
          </div>
          <div className="mt-2 space-y-1.5">
            {state.unresolved.map((item) => (
              <div key={item.proposalId} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black text-zinc-900">{item.sourceItemName}</div>
                  <div className="mt-0.5 text-[10px] font-semibold text-amber-900">{item.reason}</div>
                </div>
                {onResolveLine ? (
                  <Button
                    type="button"
                    variant="primary"
                    instance="k5-map-product"
                    onClick={() => onResolveLine(item.lineId)}
                  >
                    Mapear producto
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Surface>
  )
}
