'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, CircleDot, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { InterpretationProposalPanel } from '@/components/albaranes/InterpretationProposalPanel'
import { K5BatchReceiptReview } from '@/components/albaranes/K5BatchReceiptReview'
import { K5MappingAssistant } from '@/components/albaranes/K5MappingAssistant'
import { LineMappingModal } from '@/components/albaranes/LineMappingModal'
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
      <section className="rounded-2xl border border-[#b8cbd2] bg-[#f4f8f9] p-4">
        <div className="text-base font-black text-zinc-900">Cómo revisar este albarán</div>
        <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-600">
          No necesitas usar el diagnóstico técnico. La revisión normal se hace en estos tres pasos.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <div className="rounded-xl border border-white bg-white p-3">
            <div className="flex items-center gap-2 text-xs font-black text-zinc-900">
              <CircleDot className="h-4 w-4 text-amber-600" />
              1 · Resolver excepciones
            </div>
            <div className="mt-1 text-[11px] font-medium leading-relaxed text-zinc-600">
              Si K5 no sabe qué producto es, pulsa <b>Mapear producto</b> y elige el ingrediente correcto.
            </div>
          </div>
          <div className="rounded-xl border border-white bg-white p-3">
            <div className="flex items-center gap-2 text-xs font-black text-zinc-900">
              <ArrowRight className="h-4 w-4 text-[#36606F]" />
              2 · Revisar reconocidos
            </div>
            <div className="mt-1 text-[11px] font-medium leading-relaxed text-zinc-600">
              Las líneas seguras aparecen seleccionadas. Pulsa <b>Ver efecto</b> para comprobar cantidad y precio.
            </div>
          </div>
          <div className="rounded-xl border border-white bg-white p-3">
            <div className="flex items-center gap-2 text-xs font-black text-zinc-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              3 · Confirmar
            </div>
            <div className="mt-1 text-[11px] font-medium leading-relaxed text-zinc-600">
              Si la vista previa es correcta, pulsa <b>Confirmar</b>. Ese es el paso que aplica K4.
            </div>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <a
            href="#k5-review-actions"
            className="inline-flex min-h-10 items-center rounded-xl bg-[#36606F] px-4 text-xs font-black text-white shadow-sm"
          >
            Empezar revisión
          </a>
        </div>
      </section>

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
