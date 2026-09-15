'use client'

import { InterpretationProposalPanel } from '@/components/albaranes/InterpretationProposalPanel'
import type { K5InvoiceCandidate } from './actions'

type Props = {
  initialInvoices: K5InvoiceCandidate[]
  initialSelectedId: string | null
}

export default function K5ReviewClient({ initialInvoices, initialSelectedId }: Props) {
  const selected = initialInvoices.find((invoice) => invoice.id === initialSelectedId) ?? initialInvoices[0] ?? null
  return selected ? <InterpretationProposalPanel invoiceId={selected.id} isManager /> : null
}
