'use client'

import { useCallback, useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { InterpretationProposalPanel } from '@/components/albaranes/InterpretationProposalPanel'
import { K5BatchReceiptReview } from '@/components/albaranes/K5BatchReceiptReview'
import { K5MappingAssistant } from '@/components/albaranes/K5MappingAssistant'
import { LineMappingModal } from '@/components/albaranes/LineMappingModal'
import { Surface } from '@/components/ui/Surface'
import {
  getPurchaseInvoiceDetailAction,
  type PurchaseInvoiceDetail,
  type PurchaseInvoiceLine,
} from '@/app/dashboard/albaranes/actions'
import type { K5InvoiceCandidate } from './actions'

type Props = {
  initialInvoices: K5InvoiceCandidate[]
  initialSelectedId: string | null
}

export default function K5ReviewClient({ initialInvoices, initialSelectedId }: Props) {
  const selected = initialInvoices.find((invoice) => invoice.id === initialSelectedId) ?? initialInvoices[0] ?? null
  const [detail, setDetail] = useState<PurchaseInvoiceDetail | null>(null)
  const [mappingLine, setMappingLine] = useState<PurchaseInvoiceLine | null>(null)

  const loadDetail = useCallback(async () => {
    if (!selected) return
    const result = await getPurchaseInvoiceDetailAction(selected.id)
    if (!result.success) {
      toast.error(result.message)
      return
    }
    setDetail(result.detail)
  }, [selected?.id])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  if (!selected) return null

  function openMapping(lineId: string) {
    const line = detail?.lines.find((item) => item.id === lineId) ?? null
    if (!line) {
      toast.error('No se pudo abrir esta línea. Actualiza la revisión.')
      return
    }
    setMappingLine(line)
  }

  return (
    <div className="space-y-3">
      <Surface variant="block" instance="k5-exception-intro" className="p-4">
        <div className="text-base font-black text-zinc-900">Solo las excepciones</div>
        <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-600">
          Los productos reconocidos y validados pueden recibirse automáticamente cuando cumplen todas las comprobaciones. Aquí aparecen los datos que necesitan tu decisión.
        </p>
      </Surface>

      <div id="k5-review-actions" className="scroll-mt-4 space-y-3">
        <K5MappingAssistant invoiceId={selected.id} onResolveLine={openMapping} />
        <K5BatchReceiptReview invoiceId={selected.id} onResolveLine={openMapping} />
      </div>

      <details open={selected.activeProposals === 0} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
        <summary className="cursor-pointer text-xs font-black text-zinc-600">
          <span className="inline-flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Ver diagnóstico técnico K5 · no se usa para aceptar ni mapear
          </span>
        </summary>
        <div className="mt-3">
          <InterpretationProposalPanel invoiceId={selected.id} isManager />
        </div>
      </details>

      <LineMappingModal
        open={Boolean(mappingLine)}
        line={mappingLine}
        invoiceId={selected.id}
        supplierId={selected.supplierId}
        onClose={() => setMappingLine(null)}
        onSuccess={async () => {
          await loadDetail()
        }}
      />
    </div>
  )
}
