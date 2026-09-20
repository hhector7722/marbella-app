'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { setIngredientCurrentPriceAction } from '@/app/ingredients/actions'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/Field'
import { createClient } from '@/utils/supabase/client'

export type IngredientWizardCategory = 'Bebida' | 'Comida' | 'Packaging' | 'Limpieza' | 'Otros'
export type IngredientWizardHowCharged = 'kilo' | 'litro' | 'pack' | 'unidad'
export type IngredientWizardPricing = 'per_purchase_unit' | 'per_pack'

export type IngredientWizardInvoiceContext = {
  lineLabel?: string | null
  quantity?: string | number | null
  unitPrice?: number | null
}

export type IngredientWizardSavedMeta = {
  name?: string | null
  suggestedConversionFactor?: number | null
}

type Props = {
  ingredientId?: string | null
  initialName?: string
  initialCategory?: IngredientWizardCategory | null
  initialHowCharged?: IngredientWizardHowCharged | null
  initialPricingMode?: IngredientWizardPricing | null
  mode?: 'create' | 'editPricing' | 'editFull'
  flow?: 'full' | 'express'
  invoiceContext?: IngredientWizardInvoiceContext
  onSaved?: (ingredientId: string, meta?: IngredientWizardSavedMeta) => void
  onClose?: () => void
}

const CATEGORY_OPTIONS = ['Alimentos', 'Bebidas', 'Packaging', 'Limpieza', 'Otros'] as const
const UNIT_OPTIONS = ['kg', 'l', 'ud'] as const

function parsePrice(value: string): number {
  return Number(value.trim().replace(',', '.'))
}

/** Alta y edición mínima. La presentación del proveedor se aprende en K4/K5. */
export function IngredientWizard({
  ingredientId,
  initialName,
  initialCategory,
  invoiceContext,
  onSaved,
  onClose,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [name, setName] = useState(String(initialName ?? '').trim())
  const [category, setCategory] = useState(
    initialCategory === 'Bebida' ? 'Bebidas' : initialCategory === 'Comida' ? 'Alimentos' : initialCategory ?? 'Alimentos',
  )
  const [purchaseUnit, setPurchaseUnit] = useState<(typeof UNIT_OPTIONS)[number]>('kg')
  const [price, setPrice] = useState('')
  const [loading, setLoading] = useState(Boolean(ingredientId))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!ingredientId) return
    let active = true
    void supabase
      .from('ingredients')
      .select('name, category, purchase_unit, current_price')
      .eq('id', ingredientId)
      .single()
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) {
          toast.error(error?.message ?? 'No se pudo cargar el ingrediente.')
          setLoading(false)
          return
        }
        setName(String(data.name ?? ''))
        setCategory(String(data.category ?? 'Alimentos'))
        const unit = String(data.purchase_unit ?? 'kg').toLowerCase()
        setPurchaseUnit(unit === 'l' || unit === 'ud' ? unit : 'kg')
        const current = Number(data.current_price)
        setPrice(Number.isFinite(current) && current > 0 ? String(current).replace('.', ',') : '')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [ingredientId, supabase])

  const numericPrice = parsePrice(price)
  const validPrice = Number.isFinite(numericPrice) && numericPrice > 0
  const validName = name.trim().length > 0

  async function save() {
    if (!validName || !validPrice) {
      toast.error('Indica un nombre y un precio mayor que cero.')
      return
    }
    setSaving(true)
    try {
      let id = ingredientId ?? null
      if (!id) {
        const { data, error } = await supabase
          .from('ingredients')
          .insert({
            name: name.trim(),
            category,
            purchase_unit: purchaseUnit,
            current_price: 0,
            supplier_pricing_mode: 'per_purchase_unit',
          })
          .select('id')
          .single()
        if (error || !data) {
          toast.error(error?.message ?? 'No se pudo crear el ingrediente.')
          return
        }
        id = String(data.id)
      }

      const result = await setIngredientCurrentPriceAction(id, numericPrice)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(ingredientId ? 'Precio actualizado.' : 'Ingrediente creado.')
      onSaved?.(id, { name: name.trim() })
      onClose?.()
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="p-4 text-sm text-zinc-600">Cargando ingrediente…</p>

  return (
    <div className="space-y-4 p-1">
      {invoiceContext?.lineLabel ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
          Línea del documento: <strong>{invoiceContext.lineLabel}</strong>. La presentación y el precio observado se
          confirmarán después desde la recepción.
        </p>
      ) : null}

      <Field instance="ingredient-simple-name" label="Nombre" htmlFor="ingredient-simple-name">
        <input id="ingredient-simple-name" className="min-h-12 w-full" value={name} disabled={Boolean(ingredientId)} onChange={(event) => setName(event.target.value)} />
      </Field>

      {!ingredientId ? (
        <>
          <Field instance="ingredient-simple-category" label="Categoría" htmlFor="ingredient-simple-category">
            <select id="ingredient-simple-category" className="min-h-12 w-full" value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORY_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </Field>
          <Field instance="ingredient-simple-unit" label="Unidad de compra" htmlFor="ingredient-simple-unit">
            <select id="ingredient-simple-unit" className="min-h-12 w-full" value={purchaseUnit} onChange={(event) => setPurchaseUnit(event.target.value as (typeof UNIT_OPTIONS)[number])}>
              {UNIT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
        </>
      ) : null}

      <Field instance="ingredient-simple-price" label={ingredientId ? 'Nuevo precio' : 'Precio'} htmlFor="ingredient-simple-price" error={price !== '' && !validPrice ? 'Debe ser mayor que cero.' : undefined}>
        <div className="flex min-h-12 items-center gap-2">
          <input id="ingredient-simple-price" className="min-h-12 min-w-0 flex-1 font-mono" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
          <span className="shrink-0 text-sm font-bold text-zinc-600">€/{purchaseUnit}</span>
        </div>
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" instance="ingredient-simple-cancel" onClick={onClose}>Cancelar</Button>
        <Button type="button" variant="primary" instance="ingredient-simple-save" disabled={!validName || !validPrice} loading={saving} loadingLabel="Guardando" onClick={() => void save()}>Guardar</Button>
      </div>
    </div>
  )
}
