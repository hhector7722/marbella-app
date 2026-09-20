'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { setIngredientCurrentPriceAction } from '@/app/ingredients/actions'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/Field'
import { createClient } from '@/utils/supabase/client'

export type IngredientCreateContext = {
  lineLabel?: string | null
}

export type IngredientCreateMeta = {
  name: string
}

type Props = {
  initialName?: string
  context?: IngredientCreateContext
  onCreated?: (ingredientId: string, meta: IngredientCreateMeta) => void | Promise<void>
  onClose?: () => void
}

const CATEGORY_OPTIONS = ['Alimentos', 'Bebidas', 'Packaging', 'Limpieza', 'Otros'] as const
const UNIT_OPTIONS = ['kg', 'l', 'ud'] as const

function parsePrice(value: string): number {
  return Number(value.trim().replace(',', '.'))
}

/**
 * Única alta simple de ingrediente.
 * - Fuera de una recepción: el precio inicial usa el writer manual canónico.
 * - Desde un albarán: el precio NO se pide aquí; lo establecerá K4 al confirmar la recepción.
 * - La presentación del proveedor nunca se configura en este formulario.
 */
export function IngredientCreateForm({
  initialName,
  context,
  onCreated,
  onClose,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [name, setName] = useState(String(initialName ?? '').trim())
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>('Alimentos')
  const [purchaseUnit, setPurchaseUnit] = useState<(typeof UNIT_OPTIONS)[number]>('kg')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)

  const fromReceipt = Boolean(context?.lineLabel)
  const numericPrice = parsePrice(price)
  const validPrice = fromReceipt || (Number.isFinite(numericPrice) && numericPrice > 0)
  const validName = name.trim().length > 0

  async function save() {
    if (!validName) {
      toast.error('Indica el nombre del ingrediente.')
      return
    }
    if (!validPrice) {
      toast.error('Indica un precio mayor que cero.')
      return
    }

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('ingredients')
        .insert({
          name: name.trim(),
          category,
          purchase_unit: purchaseUnit,
          current_price: 0,
        })
        .select('id')
        .single()

      if (error || !data) {
        toast.error(error?.message ?? 'No se pudo crear el ingrediente.')
        return
      }

      const ingredientId = String(data.id)

      if (!fromReceipt) {
        const result = await setIngredientCurrentPriceAction(ingredientId, numericPrice)
        if (!result.ok) {
          toast.error(result.message)
          return
        }
      }

      toast.success('Ingrediente creado.')
      await onCreated?.(ingredientId, { name: name.trim() })
      onClose?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 p-1">
      {fromReceipt ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
          <p className="text-xs font-bold text-zinc-800">
            {context?.lineLabel}
          </p>
          <p className="mt-1 text-xs leading-snug text-zinc-600">
            Crea el ingrediente. El precio y la presentación se confirmarán después desde este albarán.
          </p>
        </div>
      ) : null}

      <Field instance="ingredient-create-name" label="Nombre" htmlFor="ingredient-create-name">
        <input
          id="ingredient-create-name"
          className="min-h-12 w-full"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field instance="ingredient-create-category" label="Categoría" htmlFor="ingredient-create-category">
        <select
          id="ingredient-create-category"
          className="min-h-12 w-full"
          value={category}
          onChange={(event) => setCategory(event.target.value as (typeof CATEGORY_OPTIONS)[number])}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </Field>

      <Field instance="ingredient-create-unit" label="Unidad de compra" htmlFor="ingredient-create-unit">
        <select
          id="ingredient-create-unit"
          className="min-h-12 w-full"
          value={purchaseUnit}
          onChange={(event) => setPurchaseUnit(event.target.value as (typeof UNIT_OPTIONS)[number])}
        >
          <option value="kg">kg</option>
          <option value="l">litro</option>
          <option value="ud">unidad</option>
        </select>
      </Field>

      {!fromReceipt ? (
        <Field
          instance="ingredient-create-price"
          label="Precio"
          htmlFor="ingredient-create-price"
          error={price !== '' && !validPrice ? 'Introduce un precio mayor que cero.' : undefined}
        >
          <div className="flex min-h-12 items-center gap-2">
            <input
              id="ingredient-create-price"
              className="min-h-12 min-w-0 flex-1 font-mono tabular-nums"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
            <span className="shrink-0 text-sm font-bold text-zinc-600">€/{purchaseUnit}</span>
          </div>
        </Field>
      ) : (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
          <p className="text-xs font-bold text-emerald-900">
            Precio: se establecerá al confirmar la recepción
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          instance="ingredient-create-cancel"
          disabled={saving}
          onClick={onClose}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="primary"
          instance="ingredient-create-save"
          disabled={!validName || !validPrice}
          loading={saving}
          loadingLabel="Creando"
          onClick={() => void save()}
        >
          Crear
        </Button>
      </div>
    </div>
  )
}
