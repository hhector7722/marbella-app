'use client'

import { InterpretationProposalPanel } from '@/components/albaranes/InterpretationProposalPanel'
import { K5BatchReceiptReview } from '@/components/albaranes/K5BatchReceiptReview'
import { K5MappingAssistant } from '@/components/albaranes/K5MappingAssistant'
import type { K5InvoiceCandidate } from './actions'

type Props = {
  initialInvoices: K5InvoiceCandidate[]
  initialSelectedId: string | null
}

export default function K5ReviewClient({ initialInvoices, initialSelectedId }: Props) {
  const selected = initialInvoices.find((invoice) => invoice.id === initialSelectedId) ?? initialInvoices[0] ?? null
  if (!selected) return null

  return (
    <div className="space-y-3">
      <K5MappingAssistant invoiceId={selected.id} />
      <K5BatchReceiptReview invoiceId={selected.id} />
      <details className="rounded-2xl border border-zinc-200 bg-white p-3">
        <summary className="cursor-pointer text-xs font-black text-zinc-700">
          Diagnóstico técnico K5
        </summary>
        <div className="mt-3">
          <InterpretationProposalPanel invoiceId={selected.id} isManager />
        </div>
      </details>
    </div>
  )
}
