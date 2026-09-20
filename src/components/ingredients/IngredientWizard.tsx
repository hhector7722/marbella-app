'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/Field'
import {
  createCanonicalIngredientAction,
  setIngredientCanonicalPriceAction,
} from '@/app/ingredients/actions'

export type IngredientWizardInvoiceContext = {
  lineLabel?: string | null
  quantity?: string | number | null
  unitPrice?: number | null
}

export type IngredientWizardSavedMeta = {
  name?: string | null
  suggestedConversionFactor?: number | null
}

type CanonicalUnit = 'kg' | 'l' | 'ud'

const CATEGORIES = ['Alimentos', 'Packaging', 'Bebidas', 'Limpieza', 'Otros'] as const

function defaultRecipeUnit(unit: CanonicalUnit) {
  if (unit === 'kg') return 'g'
  if (unit === 'l') return 'ml'
  return 'ud'
}

export function IngredientWizard({
  ingredientId: initialIngredientId,
  initialName,
  mode,
  flow = 'full',
  invoiceContext,
  onSaved,
  onClose,
}: {
  ingredientId?: string | null
  initialName?: string
  initialCategory?: unknown
  initialHowCharged?: unknown
  initialPricingMode?: unknown
  mode?: 'create' | 'editPricing' | 'editFull'
  flow?: 'full' | 'express'
  invoiceContext?: IngredientWizardInvoiceContext
  onSaved?: (ingredientId: string, meta?: IngredientWizardSavedMeta) => void
  onClose?: () => void
}) {
  const supabase = createClient()
  const isInvoiceFlow = flow === 'express'
  const isEditing = Boolean(initialIngredientId)

  const [loading, setLoading] = useState(Boolean(initialIngredientId))
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(String(initialName ?? '').trim())
  const [category, setCategory] = useState<string>('Alimentos')
  const [purchaseUnit, setPurchaseUnit] = useState<CanonicalUnit>('kg')
  const [currentPrice, setCurrentPrice] = useState<number>(0)
  const [priceLocked, setPriceLocked] = useState(false)
  const [supplier, setSupplier] = useState<string>('')
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const supplierRes = await supabase.from('suppliers').select('id,name').order('name')
      if (!cancelled && !supplierRes.error) {
        setSuppliers(
          (supplierRes.data ?? [])
            .map((row) => ({ id: String(row.id), name: String(row.name ?? '').trim() }))
            .filter((row) => row.name)
        )
      }

      if (!initialIngredientId) {
        if (!cancelled) setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('ingredients')
        .select('name,category,purchase_unit,current_price,price_locked,supplier')
        .eq('id', initialIngredientId)
        .maybeSingle()

      if (cancelled) return
      if (error || !data) {
        toast.error(error?.message ?? 'Ingrediente no encontrado')
        setLoading(false)
        return
      }

      setName(String(data.name ?? ''))
      setCategory(String(data.category ?? 'Alimentos'))
      const unit = String(data.purchase_unit ?? 'kg').toLowerCase()
      setPurchaseUnit(unit === 'l' ? 'l' : unit === 'ud' ? 'ud' : 'kg')
      setCurrentPrice(Number(data.current_price) || 0)
      setPriceLocked(data.price_locked === true)
      setSupplier(String(data.supplier ?? ''))
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [initialIngredientId, supabase])

  const invoiceSummary = useMemo(() => {
    if (!isInvoiceFlow) return null
    const pieces = [
      invoiceContext?.lineLabel ? String(invoiceContext.lineLabel) : null,
      invoiceContext?.quantity != null && invoiceContext.quantity !== ''
        ? `Cant. ${invoiceContext.quantity}`
        : null,
      Number(invoiceContext?.unitPrice) > 0
        ? `${Number(invoiceContext?.unitPrice).toFixed(2).replace('.', ',')} € observados`
        : null,
    ].filter(Boolean)
    return pieces.join(' · ')
  }, [invoiceContext, isInvoiceFlow])

  async function save() {
    const cleanName = name.trim()
    if (!cleanName) {
      toast.error('El nombre es obligatorio')
      return
    }

    if (!isInvoiceFlow && (!Number.isFinite(currentPrice) || currentPrice < 0)) {
      toast.error('Precio inválido')
      return
    }

    setSaving(true)
    try {
      if (!initialIngredientId) {
        const result = await createCanonicalIngredientAction({
          name: cleanName,
          category,
          purchaseUnit,
          currentPrice: isInvoiceFlow ? 0 : currentPrice,
          priceLocked,
          supplier: supplier || null,
          recipeUnit: defaultRecipeUnit(purchaseUnit),
        })

        if (!result.success) throw new Error(result.message)

        toast.success(
          isInvoiceFlow
            ? 'Ingrediente creado. El precio se fijará al confirmar la recepción.'
            : 'Ingrediente creado'
        )
        onSaved?.(result.ingredientId, { name: cleanName, suggestedConversionFactor: null })
        onClose?.()
        return
      }

      const { error: detailsError } = await supabase
        .from('ingredients')
        .update({
          name: cleanName,
          category,
          supplier: supplier || null,
        })
        .eq('id', initialIngredientId)

      if (detailsError) throw detailsError

      if (!isInvoiceFlow) {
        const priceResult = await setIngredientCanonicalPriceAction({
          ingredientId: initialIngredientId,
          currentPrice,
          priceLocked,
          reason: mode === 'editPricing' ? 'Edición manual de precio' : 'Edición de ingrediente',
        })
        if (!priceResult.success) throw new Error(priceResult.message)
      }

      toast.success(isInvoiceFlow ? 'Ingrediente actualizado' : 'Precio guardado')
      onSaved?.(initialIngredientId, { name: cleanName, suggestedConversionFactor: null })
      onClose?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm font-semibold text-zinc-500">Cargando…</div>
  }

  return (
    <div className="space-y-4">
      {isInvoiceFlow ? (
        <div className="rounded-xl border border-[#36606F]/15 bg-[#36606F]/5 px-3 py-2.5">
          <div className="text-[10px] font-black uppercase tracking-wider text-[#36606F]">
            Datos del albarán
          </div>
          <div className="mt-1 text-xs font-medium text-zinc-700">{invoiceSummary || 'Línea actual'}</div>
          <div className="mt-2 text-xs text-zinc-600">
            Aquí solo se define la ficha del ingrediente. El precio observado no se copia al catálogo:
            K4 lo calculará y aplicará al confirmar la recepción.
          </div>
        </div>
      ) : null}

      <Field instance="ingredient-canonical-name" label="Ingrediente" htmlFor="ingredient-canonical-name">
        <input
          id="ingredient-canonical-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nombre del ingrediente"
        />
      </Field>

      <Field instance="ingredient-canonical-category" label="Categoría" htmlFor="ingredient-canonical-category">
        <select
          id="ingredient-canonical-category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </Field>

      <Field
        instance="ingredient-canonical-unit"
        label="Unidad de compra"
        htmlFor="ingredient-canonical-unit"
      >
        {isEditing ? (
          <div className="flex min-h-12 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-bold text-zinc-800">
            {purchaseUnit}
          </div>
        ) : (
          <select
            id="ingredient-canonical-unit"
            value={purchaseUnit}
            onChange={(event) => setPurchaseUnit(event.target.value as CanonicalUnit)}
          >
            <option value="kg">kg</option>
            <option value="l">litro</option>
            <option value="ud">unidad</option>
          </select>
        )}
      </Field>

      {!isInvoiceFlow ? (
        <>
          <Field
            instance="ingredient-canonical-price"
            label={`Precio actual (€/${purchaseUnit})`}
            htmlFor="ingredient-canonical-price"
          >
            <input
              id="ingredient-canonical-price"
              type="number"
              step="0.0001"
              min="0"
              inputMode="decimal"
              value={currentPrice || ''}
              onChange={(event) => {
                const value = Number(String(event.target.value).replace(',', '.'))
                setCurrentPrice(Number.isFinite(value) ? value : 0)
              }}
            />
          </Field>

          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3">
            <input
              type="checkbox"
              checked={priceLocked}
              onChange={(event) => setPriceLocked(event.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-semibold text-zinc-800">
              Precio fijo: los albaranes no lo modifican
            </span>
          </label>
        </>
      ) : null}

      <Field instance="ingredient-canonical-supplier" label="Proveedor habitual" htmlFor="ingredient-canonical-supplier">
        <select
          id="ingredient-canonical-supplier"
          value={supplier}
          onChange={(event) => setSupplier(event.target.value)}
        >
          <option value="">Sin proveedor fijo</option>
          {suppliers.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        {onClose ? (
          <Button type="button" variant="secondary" instance="ingredient-canonical-cancel" onClick={onClose}>
            Cancelar
          </Button>
        ) : null}
        <Button
          type="button"
          variant="primary"
          instance="ingredient-canonical-save"
          disabled={saving}
          loading={saving}
          onClick={() => void save()}
        >
          {isInvoiceFlow ? 'Guardar ficha' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
