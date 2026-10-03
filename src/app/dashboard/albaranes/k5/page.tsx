import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import K5ReviewClient from './K5ReviewClient'
import { Surface } from '@/components/ui/Surface'
import {
  getMistralOpsMetricsAction,
  getK5InvoiceAvailabilityAction,
  listK5InvoiceCandidatesAction,
  type K5InvoiceAvailability,
} from './actions'

export const dynamic = 'force-dynamic'

function formatDate(value: string | null): string {
  if (!value) return 'Sin fecha'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function metricNumber(value: number): string {
  return value > 0 ? new Intl.NumberFormat('es-ES').format(value) : '—'
}

function metricRate(value: number | null): string {
  return value != null && value > 0
    ? new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 }).format(value)
    : '—'
}

function unavailableCopy(
  availability: K5InvoiceAvailability | null,
  lookupError: string | null
): { title: string; body: string; detail: string | null; failed: boolean } {
  if (lookupError) {
    return {
      title: 'No se pudo comprobar el estado de extracción',
      body: lookupError,
      detail: null,
      failed: true,
    }
  }

  switch (availability?.kind) {
    case 'processing':
      return {
        title: 'El albarán todavía se está procesando',
        body: 'La extracción sigue pendiente o con una lease activa. Vuelve a abrir la revisión cuando termine.',
        detail: availability.detail,
        failed: false,
      }
    case 'no_table':
      return {
        title: 'No se detectó una tabla estructurada',
        body: 'La evidencia existe y K5 puede intentar reconstruir las líneas por posición. Si no aparecen en la cola, recarga para revalidar el fallback de layout.',
        detail: availability.detail,
        failed: false,
      }
    case 'failed':
      return {
        title: 'No se pudo completar la extracción de este albarán',
        body: 'La extracción terminó con un error operativo. Puedes revisar el detalle y reintentar desde el albarán.',
        detail: availability.detail,
        failed: true,
      }
    case 'supplier_missing':
      return {
        title: 'Falta identificar el proveedor',
        body: 'K5 necesita un proveedor asignado antes de interpretar este albarán.',
        detail: null,
        failed: false,
      }
    case 'discarded':
      return {
        title: 'Este albarán está descartado',
        body: 'Los albaranes descartados no entran en la cola de Revisión K5.',
        detail: null,
        failed: false,
      }
    case 'available':
      return {
        title: 'La extracción ya está disponible',
        body: 'La cola de revisión puede haber cambiado mientras abrías la página. Recarga para volver a construirla.',
        detail: null,
        failed: false,
      }
    case 'missing':
    default:
      return {
        title: 'Este albarán todavía no tiene una extracción disponible',
        body: 'No hay una extracción estructurada ni un trabajo activo que se pueda revisar.',
        detail: null,
        failed: false,
      }
  }
}

export default async function K5ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [result, mistralMetrics] = await Promise.all([
    listK5InvoiceCandidatesAction(), getMistralOpsMetricsAction(),
  ])
  if (!result.success) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
          {result.message}
        </div>
      </div>
    )
  }

  const query = await searchParams
  const requestedId = query.id?.trim() || null
  const requestedInvoice = requestedId
    ? result.invoices.find((invoice) => invoice.id === requestedId) ?? null
    : null
  const selectedId = requestedId
    ? requestedInvoice?.id ?? null
    : result.invoices[0]?.id ?? null
  const requestedInvoiceUnavailable = Boolean(requestedId && !requestedInvoice)
  let unavailableAvailability: K5InvoiceAvailability | null = null
  let unavailableLookupError: string | null = null
  if (requestedInvoiceUnavailable && requestedId) {
    const availabilityResult = await getK5InvoiceAvailabilityAction({ invoiceId: requestedId })
    if (availabilityResult.success) unavailableAvailability = availabilityResult.availability
    else unavailableLookupError = availabilityResult.message
  }
  const unavailable = unavailableCopy(unavailableAvailability, unavailableLookupError)

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-zinc-900">Revisar albaranes</h1>
          <p className="mt-1 text-xs font-medium text-zinc-600">
            Resuelve las excepciones reales. Las líneas seguras pendientes pueden confirmarse juntas; el detalle técnico queda al final.
          </p>
        </div>
        <Link href="/dashboard/albaranes" className="text-xs font-black text-zinc-700 underline underline-offset-4">
          Volver a albaranes
        </Link>
      </div>

      {mistralMetrics && mistralMetrics.jobs > 0 ? (
        <Surface variant="block" instance="albaranes-mistral-metrics" className="mb-3 p-4">
          <div className="text-sm font-black text-zinc-900">Procesamiento Mistral · últimos 100 trabajos</div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div><div className="font-semibold text-zinc-600">Documentos procesados</div><div className="text-lg font-black">{metricNumber(mistralMetrics.completed)}</div></div>
            <div><div className="font-semibold text-zinc-600">Líneas reconocidas</div><div className="text-lg font-black">{metricNumber(mistralMetrics.matchedLines)} / {metricNumber(mistralMetrics.extractedLines)}</div></div>
            <div><div className="font-semibold text-zinc-600">Mapeo automático</div><div className="text-lg font-black">{metricRate(mistralMetrics.mappingRate)}</div></div>
            <div><div className="font-semibold text-zinc-600">Recibidas sin intervención</div><div className="text-lg font-black">{metricRate(mistralMetrics.autoReceiptRate)}</div></div>
          </div>
          <p className="mt-2 text-xs font-medium text-zinc-600">
            {metricNumber(mistralMetrics.pages)} páginas · {metricNumber(mistralMetrics.exceptionLines)} líneas con excepción · {metricNumber(mistralMetrics.failed)} trabajos fallidos
            {mistralMetrics.averageDurationSeconds != null ? ` · ${mistralMetrics.averageDurationSeconds.toFixed(1)} s de media` : ''}
          </p>
        </Surface>
      ) : null}

      {result.invoices.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm font-bold text-zinc-600">
          No hay albaranes con evidencia disponible para revisar.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="rounded-2xl border border-zinc-200 bg-white p-2">
            <div className="mb-2 px-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
              Albaranes para revisar · {result.invoices.length}
            </div>
            <div className="flex max-h-[72vh] flex-col gap-1 overflow-y-auto">
              {result.invoices.map((invoice) => (
                <Link
                  key={invoice.id}
                  href={`/dashboard/albaranes/k5?id=${encodeURIComponent(invoice.id)}`}
                  className={`rounded-xl border px-3 py-2.5 ${invoice.id === selectedId ? 'border-zinc-500 bg-zinc-50' : 'border-zinc-200 bg-white'}`}
                >
                  <div className="truncate text-xs font-black text-zinc-900">{invoice.supplierName}</div>
                  <div className="mt-1 text-[10px] font-semibold text-zinc-500">
                    {invoice.invoiceNumber || 'Sin número'} · {formatDate(invoice.invoiceDate)} · {invoice.activeProposals} K5
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            {requestedInvoiceUnavailable ? (
              <div
                className={`rounded-2xl border p-5 ${
                  unavailable.failed
                    ? 'border-red-200 bg-red-50 text-red-900'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                <div className="text-sm font-black">{unavailable.title}</div>
                <div className="mt-1 text-xs font-semibold leading-relaxed">{unavailable.body}</div>
                {unavailable.detail ? (
                  <div className="mt-3 rounded-xl border border-current/15 bg-white/60 px-3 py-2 text-[11px] font-semibold leading-relaxed">
                    {unavailable.detail}
                  </div>
                ) : null}
              </div>
            ) : (
              <K5ReviewClient initialInvoices={result.invoices} initialSelectedId={selectedId} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
