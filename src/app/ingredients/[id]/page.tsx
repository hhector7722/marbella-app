'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import { Package, Pencil } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import {
  IngredientCanonicalEditModal,
  type Ingredient,
} from '@/components/ingredients/IngredientCanonicalEditModal'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { CatalogSquare } from '@/components/catalog/CatalogTile'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return '—'
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(price)
}

function valueOrDash(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  return String(value)
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

type IngredientHistoryEvent = {
  id: string
  kind: 'purchase' | 'price'
  at: string
  title: string
  subtitle: string
  value: string
}

function IngredientPanel({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section data-element="recipe-panel" className="h-full">
      <div data-element="block-header">
        <h2 data-element="title">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function IngredientFact({
  label,
  children,
  valueClassName = '',
}: {
  label: string
  children: ReactNode
  valueClassName?: string
}) {
  return (
    <div className="min-w-0">
      <div className={`min-w-0 break-words text-sm font-black text-gray-800 ${valueClassName}`}>
        {children}
      </div>
      <div data-element="field-label">{label}</div>
    </div>
  )
}

export default function IngredientDetailPage() {
  const params = useParams()
  const ingredientId = String(params.id ?? '')
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [ingredient, setIngredient] = useState<Ingredient | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [history, setHistory] = useState<IngredientHistoryEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const fetchIngredient = useCallback(async () => {
    if (!ingredientId) return

    setLoading(true)
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .eq('id', ingredientId)
      .maybeSingle()

    if (error) {
      toast.error('No se pudo cargar el ingrediente')
      setIngredient(null)
    } else {
      setIngredient((data as Ingredient | null) ?? null)
    }
    setLoading(false)
  }, [ingredientId, supabase])


  const fetchHistory = useCallback(async () => {
    if (!ingredientId) return

    setHistoryLoading(true)

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
      setHistory([])
      setHistoryLoading(false)
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

    setHistory(merged)
    setHistoryLoading(false)
  }, [ingredientId, supabase])

  useEffect(() => {
    void fetchIngredient()
    void fetchHistory()
  }, [fetchHistory, fetchIngredient])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="xl" />
      </div>
    )
  }

  if (!ingredient) {
    return (
      <DashboardDetailLayout
        title="Ingrediente"
        titleFace="display"
        titleAlign="center"
        showBackButton
        backHref="/ingredients"
        template="detail"
        work="catalog"
        maxWidthClass="max-w-6xl"
      >
        <div className="p-6 text-center text-sm font-semibold text-white/70">
          No se ha encontrado el ingrediente.
        </div>
      </DashboardDetailLayout>
    )
  }

  const purchaseUnit = ingredient.purchase_unit || 'ud'
  const recipeUnit = ingredient.recipe_unit || purchaseUnit
  const baseUnit = ingredient.base_unit || purchaseUnit
  const density =
    ingredient.density_g_per_ml != null && Number.isFinite(Number(ingredient.density_g_per_ml))
      ? `1 ml = ${String(ingredient.density_g_per_ml).replace('.', ',')} g`
      : '—'
  const waste =
    ingredient.waste_percentage != null && Number.isFinite(Number(ingredient.waste_percentage))
      ? `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(Number(ingredient.waste_percentage))}%`
      : '—'
  const recommendedStock =
    ingredient.recommended_stock != null && Number.isFinite(Number(ingredient.recommended_stock))
      ? `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(Number(ingredient.recommended_stock))} ${baseUnit}`
      : '—'
  return (
    <>
      <Toaster position="top-right" />

      <DashboardDetailLayout
        title={ingredient.name}
        titleFace="display"
        titleAlign="center"
        showBackButton
        backHref="/ingredients"
        template="detail"
        work="catalog"
        maxWidthClass="max-w-6xl"
        contentClassName="p-0 flex flex-col min-h-0"
        rightSlot={
          <Button
            type="button"
            variant="tertiary"
            instance="ingredient-edit"
            onClick={() => setEditing(true)}
            aria-label="Editar ingrediente"
            icon={<Pencil className="h-5 w-5" strokeWidth={2.2} />}
            className="shrink-0"
          />
        }
        leadSlot={
          <div className="flex w-full shrink-0 items-center justify-center py-1">
            <div className="w-[min(34vw,9rem)] shrink-0">
              <CatalogSquare
                imageSrc={ingredient.image_url}
                imageAlt={ingredient.name}
                fallback={<Package className="h-8 w-8 text-gray-300 md:h-10 md:w-10" />}
              />
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 content-start gap-4 p-4 md:grid-cols-2 md:p-5">
          <IngredientPanel title="Compra">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <IngredientFact label="Precio actual" valueClassName="text-lg tabular-nums">
                {formatPrice(ingredient.current_price)} €/{purchaseUnit}
              </IngredientFact>
              <IngredientFact label="Unidad de compra">{purchaseUnit}</IngredientFact>
              <IngredientFact label="Proveedor principal">
                {valueOrDash(ingredient.supplier)}
              </IngredientFact>
              <IngredientFact label="Segundo proveedor">
                {valueOrDash(ingredient.supplier_2)}
              </IngredientFact>
              <IngredientFact label="Unidad de pedido">
                {valueOrDash(ingredient.order_unit)}
              </IngredientFact>
              <IngredientFact label="Categoría">{valueOrDash(ingredient.category)}</IngredientFact>
            </div>
          </IngredientPanel>

          <IngredientPanel title="Uso y conversión">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <IngredientFact label="Unidad base">{baseUnit}</IngredientFact>
              <IngredientFact label="Unidad en recetas">{recipeUnit}</IngredientFact>
              <IngredientFact label="Densidad">{density}</IngredientFact>
              <IngredientFact label="Merma">{waste}</IngredientFact>
            </div>
          </IngredientPanel>

          <IngredientPanel title="Stock">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <IngredientFact label="Stock recomendado">{recommendedStock}</IngredientFact>
              <IngredientFact label="Actualización desde albaranes">
                <span className={ingredient.price_locked ? 'text-amber-700' : 'text-emerald-700'}>
                  {ingredient.price_locked ? 'Bloqueada' : 'Activa'}
                </span>
              </IngredientFact>
            </div>
          </IngredientPanel>

          <IngredientPanel title="Histórico">
            {historyLoading ? (
              <div className="flex min-h-24 items-center justify-center">
                <LoadingSpinner size="sm" />
              </div>
            ) : history.length === 0 ? (
              <div className="py-6 text-center text-xs font-semibold text-zinc-400">
                Sin compras ni cambios de precio registrados.
              </div>
            ) : (
              <div className="max-h-64 divide-y divide-zinc-100 overflow-y-auto pr-1">
                {history.map((event) => (
                  <div
                    key={event.id}
                    className="grid grid-cols-[4.75rem_minmax(0,1fr)_auto] items-start gap-2 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="pt-0.5 text-[10px] font-bold tabular-nums text-zinc-400">
                      {formatHistoryDate(event.at)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black text-zinc-800">
                        {event.title}
                      </div>
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
          </IngredientPanel>
        </div>
      </DashboardDetailLayout>

      {editing ? (
        <IngredientCanonicalEditModal
          key={ingredient.id}
          ingredient={ingredient}
          onClose={() => setEditing(false)}
          onSaved={() => {
            void fetchIngredient()
            void fetchHistory()
          }}
        />
      ) : null}
    </>
  )
}
