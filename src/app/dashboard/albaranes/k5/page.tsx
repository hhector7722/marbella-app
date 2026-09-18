import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import K5ReviewClient from './K5ReviewClient'
import { listK5InvoiceCandidatesAction } from './actions'

export const dynamic = 'force-dynamic'

function formatDate(value: string | null): string {
  if (!value) return 'Sin fecha'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
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

  const result = await listK5InvoiceCandidatesAction()
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

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-zinc-900">Revisar albaranes</h1>
          <p className="mt-1 text-xs font-medium text-zinc-600">
            Resuelve solo las excepciones y confirma las líneas reconocidas. El detalle técnico queda oculto al final.
          </p>
        </div>
        <Link href="/dashboard/albaranes" className="text-xs font-black text-zinc-700 underline underline-offset-4">
          Volver a albaranes
        </Link>
      </div>

      {result.invoices.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm font-bold text-zinc-600">
          No hay albaranes con una extracción Docling correcta disponible para revisar.
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
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900">
                Este albarán no tiene una extracción Docling correcta disponible para Revisión K5.
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
