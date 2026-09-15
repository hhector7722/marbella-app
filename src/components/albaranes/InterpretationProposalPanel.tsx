'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/Notice'
import { Surface } from '@/components/ui/Surface'
import {
  generateInterpretationProposalsAction,
  listInterpretationContextAction,
  type InterpretationExtractionView,
  type InterpretationProposalView,
} from '@/app/dashboard/albaranes/interpretation-actions'

type Props = {
  invoiceId: string
  isManager: boolean
  onChanged?: () => void | Promise<void>
}

type ContextState = {
  extractions: InterpretationExtractionView[]
  proposals: InterpretationProposalView[]
  profile: { id: string; version: string; hash: string } | null
}

const STATUS_META: Record<
  InterpretationProposalView['status'],
  { label: string; description: string }
> = {
  ready_for_review: {
    label: 'Lista para revisar',
    description: 'La propuesta es reproducible, pero K4 seguirá revalidándola antes de cualquier efecto económico.',
  },
  needs_mapping: {
    label: 'Falta mapeo',
    description: 'No hay un mapeo confirmado y compatible con esta presentación.',
  },
  needs_review: {
    label: 'Necesita revisión',
    description: 'Hay información ambigua, incompleta o contradictoria. No puede confirmarse.',
  },
  excluded: {
    label: 'Excluida',
    description: 'El perfil del proveedor excluye esta línea de stock y escandallos.',
  },
}

const REASON_LABELS: Record<string, string> = {
  supplier_profile_missing: 'No existe un perfil aplicable para este proveedor.',
  profile_table_not_found: 'La evidencia no contiene una tabla que coincida de forma segura con el perfil.',
  mapping_missing: 'Falta un mapeo confirmado para este producto y presentación.',
  mapping_presentation_incompatible: 'La presentación no coincide exactamente con el mapeo.',
  price_not_normalizable: 'El precio no puede normalizarse de forma exacta sin introducir redondeos o supuestos.',
  line_amount_mismatch: 'Cantidad × precio no concilia con el importe observado dentro de la tolerancia permitida.',
  mixed_measurement_requires_review: 'Coexisten varias medidas y su relación no está demostrada por el documento.',
  discount_requires_review: 'El descuento no puede aplicarse de forma determinista con la evidencia disponible.',
  product_missing: 'No se puede asociar con seguridad un nombre de producto a esta fila.',
}

function stringifyCompact(value: unknown): string {
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) return value.map(stringifyCompact).join(' · ')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry != null && entry !== '' && !(Array.isArray(entry) && entry.length === 0))
      .map(([key, entry]) => `${key}: ${stringifyCompact(entry)}`)
      .join(' · ') || '—'
  }
  return String(value)
}

function shortId(value: string | null | undefined): string {
  const text = String(value ?? '')
  if (text.length <= 14) return text || '—'
  return `${text.slice(0, 8)}…${text.slice(-5)}`
}

function Section({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-400">{title}</div>
      <div className="mt-1 break-words text-[11px] font-medium leading-relaxed text-zinc-700">
        {stringifyCompact(value)}
      </div>
    </div>
  )
}

function ProposalCard({ proposal }: { proposal: InterpretationProposalView }) {
  const status = STATUS_META[proposal.status]
  const reasonLabels = proposal.reviewReasons.map((reason) => REASON_LABELS[reason] ?? reason)
  const warningLabels = proposal.warnings.map((warning) => {
    if (warning.startsWith('observed_measures:')) {
      return `Medidas observadas: ${warning.slice('observed_measures:'.length).replaceAll('|', ' · ')}`
    }
    return warning
  })

  return (
    <Surface variant="block" instance={`albaran-k5-proposal-${proposal.id}`} className="min-w-0 p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-zinc-900">
            {proposal.sourceItemName || 'Fila sin producto asociable'}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-zinc-500">
            Tabla {proposal.sourceTableIndex ?? '—'} · fila {proposal.sourceRowIndex ?? '—'} · {shortId(proposal.id)}
          </div>
        </div>
        <div
          className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-700"
          title={status.description}
        >
          {status.label}
        </div>
      </div>

      <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <Section title="1 · Observado" value={proposal.observed} />
        <Section title="2 · Interpretado" value={proposal.interpreted} />
        <Section
          title="3 · Mapping"
          value={proposal.mappingVersionId
            ? { mapping_version: shortId(proposal.mappingVersionId), ingredient: shortId(proposal.ingredientId) }
            : 'Sin mapping seguro'}
        />
        <Section title="4 · Normalizado" value={proposal.normalized} />
        <Section title="5 · Precio" value={proposal.pricing} />
        <Section title="6 · Pedido / conciliación" value="Se propone aquí; K4 revalida y aplica solo tras confirmación humana." />
      </div>

      <div className="mt-2">
        <Section
          title="7 · Alertas"
          value={reasonLabels.length || warningLabels.length
            ? [...reasonLabels, ...warningLabels]
            : proposal.confirmed
              ? 'Propuesta confirmada por K4 y enlazada a su recepción.'
              : 'Sin bloqueos de interpretación. Pendiente de revisión humana.'}
        />
      </div>
    </Surface>
  )
}

export function InterpretationProposalPanel({ invoiceId, isManager, onChanged }: Props) {
  const [context, setContext] = useState<ContextState | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedExtractionId, setSelectedExtractionId] = useState('')

  const load = useCallback(async () => {
    if (!isManager || !invoiceId) return
    setLoading(true)
    setError(null)
    try {
      const result = await listInterpretationContextAction({ invoiceId })
      if (!result.success) {
        setError(result.message)
        return
      }
      setContext({
        extractions: result.extractions,
        proposals: result.proposals,
        profile: result.profile,
      })
      const successful = result.extractions.filter((extraction) => extraction.status === 'success')
      setSelectedExtractionId((current) => {
        if (current && successful.some((extraction) => extraction.id === current)) return current
        return successful.length === 1 ? successful[0]!.id : ''
      })
    } finally {
      setLoading(false)
    }
  }, [invoiceId, isManager])

  useEffect(() => {
    void load()
  }, [load])

  const selectedExtraction = useMemo(
    () => context?.extractions.find((extraction) => extraction.id === selectedExtractionId) ?? null,
    [context?.extractions, selectedExtractionId]
  )

  async function generate() {
    if (!selectedExtractionId) {
      toast.error('Selecciona explícitamente la extracción que quieres interpretar.')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const result = await generateInterpretationProposalsAction({
        invoiceId,
        extractionId: selectedExtractionId,
      })
      if (!result.success) {
        setError(result.message)
        toast.error(result.message)
        return
      }
      toast.success(result.created > 0 ? 'Propuesta K5 generada' : 'La propuesta K5 ya era reproducible')
      await load()
      await onChanged?.()
    } finally {
      setGenerating(false)
    }
  }

  if (!isManager) {
    return (
      <Notice instance="albaran-k5-manager-only" variant="info" title="Interpretación protegida">
        La evidencia está conservada. Solo manager o administración puede generar y revisar propuestas K5.
      </Notice>
    )
  }

  return (
    <Surface variant="block" instance="albaran-k5-interpretation" className="min-w-0 p-3">
      <div className="flex min-w-0 items-start gap-3">
        <FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-ds-marca" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-zinc-900">Interpretación K5</div>
          <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-zinc-600">
            Docling aporta evidencia; el perfil interpreta; el mapping identifica la presentación. Nada de este panel modifica stock, precio ni escandallos.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs font-bold text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando trazabilidad…
        </div>
      ) : null}

      {error ? (
        <div className="mt-3">
          <Notice instance="albaran-k5-error" variant="negative" title="K5 detenido">
            {error}
          </Notice>
        </div>
      ) : null}

      {context ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Section
              title="Perfil versionado"
              value={context.profile
                ? `${context.profile.id} · v${context.profile.version} · ${shortId(context.profile.hash)}`
                : 'Sin perfil aplicable: la propuesta quedará en needs_review.'}
            />
            <Section
              title="Extracción seleccionada"
              value={selectedExtraction
                ? `${shortId(selectedExtraction.id)} · ${selectedExtraction.extractorVersion} · hash ${shortId(selectedExtraction.fileVersionHash)}`
                : 'Selecciona una extracción explícita.'}
            />
          </div>

          {context.extractions.filter((extraction) => extraction.status === 'success').length > 1 ? (
            <label className="block min-w-0">
              <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-zinc-400">
                Evidencia a interpretar
              </span>
              <select
                value={selectedExtractionId}
                onChange={(event) => setSelectedExtractionId(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-800 outline-none focus:border-ds-marca"
              >
                <option value="">Seleccionar explícitamente…</option>
                {context.extractions
                  .filter((extraction) => extraction.status === 'success')
                  .map((extraction) => (
                    <option key={extraction.id} value={extraction.id}>
                      {shortId(extraction.id)} · {extraction.extractorVersion} · {new Date(extraction.extractedAt).toLocaleString('es-ES')}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              instance="albaran-k5-generate"
              onClick={() => void generate()}
              disabled={!selectedExtractionId || generating}
              loading={generating}
              loadingLabel="Interpretando"
            >
              {context.proposals.length > 0 ? 'Recalcular como nueva propuesta' : 'Generar propuesta'}
            </Button>
            <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-zinc-500">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              Confirmar sigue siendo una acción separada de K4.
            </div>
          </div>

          {context.proposals.length === 0 ? (
            <Notice instance="albaran-k5-empty" variant="info" title="Evidencia disponible">
              Selecciona la extracción y genera una propuesta reproducible. No se crearán efectos económicos.
            </Notice>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Propuestas activas · {context.proposals.length}
                </div>
                {context.proposals.every((proposal) => proposal.status === 'ready_for_review' || proposal.status === 'excluded') ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
              </div>
              {context.proposals.map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Surface>
  )
}
