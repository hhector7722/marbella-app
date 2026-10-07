'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/modal'

type IngredientHistoryEvent = {
  id: string
  kind: 'purchase' | 'price'
  at: string
  title: string
  subtitle: string
  value: string
}

function formatCompactNumber(value: number | null | undefined, maximumFractionDigits = 3): string {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits }).format(Number(value))
}

function formatHistoryDate(value: string | null | undefined): string {
  if (!value) return '—'
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date)
}

/**
 * Historial detallado de compras y cambios de precio. No se consulta hasta que
 * la persona lo pide: se monta bajo demanda y carga al abrirse.
 */
export function IngredientHistoryModal({
  ingredientId,
  open,
  onClose,
}: {
  ingredientId: string
  open: boolean
  onClose: () => void
}) {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const loadedRef = useRef(false)
  const [events, setEvents] = useState<IngredientHistoryEvent[]>([])
  const [loading, setLoading] = useState(false)

  const fetchHistory = useCallback(async () => {
    if (!ingredientId) return

    setLoading(true)

    const [purchaseLinesResult, priceHistoryResult] = await Promise.all([
      supabase
        .from('purchase_invoice_lines')
        .select('id,invoice_id,quantity,line_unit,unit_price,total_price,original_name')
        .eq('mapped_ingredient_id', ingredientId)
        .is('superseded_by_extraction_id', null)
        .limit(200),
      supabase
        .from('ingredient_price_history')
        .select('id,changed_at,old_price,new_price,source,purchase_invoice_line_id,receipt_confirmation_id')
        .eq('ingredient_id', ingredientId)
        .order('changed_at', { ascending: false })
        .limit(200),
    ])

    if (purchaseLinesResult.error || priceHistoryResult.error) {
      console.error('Ingredient history load failed', {
        purchases: purchaseLinesResult.error?.message,
        prices: priceHistoryResult.error?.message,
      })
      setEvents([])
      setLoading(false)
      return
    }

    const purchaseLines = purchaseLinesResult.data ?? []
    const invoiceIds = [...new Set(
      purchaseLines
        .map((line) => line.invoice_id)
        .filter((id): id is string => Boolean(id)),
    )]

    const invoicesResult = invoiceIds.length > 0
      ? await supabase
          .from('purchase_invoices')
          .select('id,invoice_date,created_at,invoice_number,supplier_id')
          .in('id', invoiceIds)
      : { data: [], error: null }

    if (invoicesResult.error) {
      console.error('Ingredient history invoices load failed', invoicesResult.error.message)
    }

    const invoices = invoicesResult.data ?? []
    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]))
    const supplierIds = [...new Set(
      invoices
        .map((invoice) => invoice.supplier_id)
        .filter((id): id is number => id != null),
    )]

    const suppliersResult = supplierIds.length > 0
      ? await supabase.from('suppliers').select('id,name').in('id', supplierIds)
      : { data: [], error: null }

    if (suppliersResult.error) {
      console.error('Ingredient history suppliers load failed', suppliersResult.error.message)
    }

    const supplierById = new Map(
      (suppliersResult.data ?? []).map((supplier) => [supplier.id, supplier.name]),
    )

    const purchaseEvents: IngredientHistoryEvent[] = purchaseLines.map((line) => {
      const invoice = line.invoice_id ? invoiceById.get(line.invoice_id) : undefined
      const supplierName = invoice?.supplier_id != null
        ? supplierById.get(invoice.supplier_id) ?? null
        : null
      const at = invoice?.invoice_date
        ? `${invoice.invoice_date}T12:00:00`
        : invoice?.created_at ?? ''
      const unit = line.line_unit?.trim() || ''
      const quantity = line.quantity != null
        ? `${formatCompactNumber(line.quantity)}${unit ? ` ${unit}` : ''}`
        : null
      const total = line.total_price != null
        ? `${formatCompactNumber(line.total_price, 2)} €`
        : null
      const invoiceLabel = invoice?.invoice_number?.trim()
        ? `Albarán ${invoice.invoice_number.trim()}`
        : null

      return {
        id: `purchase-${line.id}`,
        kind: 'purchase',
        at,
        title: supplierName ? `Compra · ${supplierName}` : 'Compra',
        subtitle: [invoiceLabel, quantity, total].filter(Boolean).join(' · ') || line.original_name,
        value: line.unit_price != null
          ? `${formatCompactNumber(line.unit_price, 4)} €${unit ? `/${unit}` : ''}`
          : '—',
      }
    })

    const priceEvents: IngredientHistoryEvent[] = (priceHistoryResult.data ?? []).map((row) => {
      const source = row.source?.trim() ?? ''
      const fromPurchase = Boolean(row.purchase_invoice_line_id || row.receipt_confirmation_id)
      const title = source === 'manual'
        ? 'Cambio de precio manual'
        : fromPurchase
          ? 'Precio actualizado por compra'
          : 'Cambio de precio'

      return {
        id: `price-${row.id}`,
        kind: 'price',
        at: row.changed_at ?? '',
        title,
        subtitle: source && source !== 'manual' && !fromPurchase ? source : 'Precio canónico',
        value: `${formatCompactNumber(row.old_price, 4)} € → ${formatCompactNumber(row.new_price, 4)} €`,
      }
    })

    const merged = [...purchaseEvents, ...priceEvents]
      .sort((a, b) => {
        const aTime = a.at ? new Date(a.at).getTime() : 0
        const bTime = b.at ? new Date(b.at).getTime() : 0
        return bTime - aTime
      })

    setEvents(merged)
    setLoading(false)
  }, [ingredientId, supabase])

  useEffect(() => {
    if (!open || loadedRef.current) return
    loadedRef.current = true
    void fetchHistory()
  }, [open, fetchHistory])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Historial"
      instance="ingredient-history"
      variant="work"
      scrollContent
    >
      {loading ? (
        <div className="flex min-h-40 items-center justify-center">
          <LoadingSpinner size="md" />
        </div>
      ) : events.length === 0 ? (
        <div className="py-10 text-center text-xs font-semibold text-zinc-400">
          Sin compras ni cambios de precio registrados.
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {events.map((event) => (
            <div
              key={event.id}
              className="grid grid-cols-[4.75rem_minmax(0,1fr)_auto] items-start gap-2 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="pt-0.5 text-[10px] font-bold tabular-nums text-zinc-400">
                {formatHistoryDate(event.at)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-black text-zinc-800">{event.title}</div>
                <div className="mt-0.5 truncate text-[10px] font-medium text-zinc-500">
                  {event.subtitle}
                </div>
              </div>
              <div
                className={
                  event.kind === 'price'
                    ? 'whitespace-nowrap text-right text-[11px] font-black tabular-nums text-ds-marca'
                    : 'whitespace-nowrap text-right text-[11px] font-black tabular-nums text-zinc-800'
                }
              >
                {event.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
