'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/modal'
import { setIngredientCurrentPriceAction } from '@/app/ingredients/actions'
import type { Ingredient } from '@/components/ingredients/IngredientEditModal'

type Props = {
  ingredient: Ingredient
  onClose: () => void
  onSaved: () => void
}

function priceInputValue(price: number): string {
  return Number.isFinite(price) && price > 0 ? String(price).replace('.', ',') : ''
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(price)
}

export function IngredientCanonicalEditModal({ ingredient, onClose, onSaved }: Props) {
  const [newPrice, setNewPrice] = useState(() => priceInputValue(ingredient.current_price))
  const [saving, setSaving] = useState(false)

  const parsedPrice = Number(newPrice.trim().replace(',', '.'))
  const validPrice = Number.isFinite(parsedPrice) && parsedPrice > 0
  const unit = ingredient.purchase_unit || 'ud'

  async function savePrice() {
    if (!validPrice) {
      toast.error('El precio debe ser mayor que cero.')
      return
    }

    setSaving(true)
    try {
      const result = await setIngredientCurrentPriceAction(ingredient.id, parsedPrice)
      if (!result.ok) {
        toast.error(result.message)
        return
      }

      if (result.changed) {
        toast.success(
          `Precio actualizado · ${formatPrice(ingredient.current_price)} € → ${formatPrice(result.currentPrice)} €`,
        )
      } else {
        toast.success('El precio ya estaba actualizado.')
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={ingredient.name}
      variant="compact"
      layer="base"
      instance="ingredient-canonical-price"
      usageId="ingredient-canonical-price"
      usageLabel="Editar precio de ingrediente"
      footer={
        <div className="flex w-full min-w-0 justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            instance="ingredient-canonical-price-cancel"
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            instance="ingredient-canonical-price-save"
            disabled={!validPrice}
            loading={saving}
            loadingLabel="Guardando"
            onClick={() => void savePrice()}
          >
            Guardar
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <section aria-labelledby="ingredient-current-price" className="space-y-1">
          <h2 id="ingredient-current-price" className="text-xs font-bold text-zinc-500">
            Precio actual
          </h2>
          <p className="font-mono text-2xl font-black tabular-nums text-zinc-950">
            {formatPrice(ingredient.current_price)} €/{unit}
          </p>
        </section>

        <Field
          instance="ingredient-canonical-new-price"
          label="Nuevo precio"
          htmlFor="ingredient-canonical-new-price"
          error={newPrice !== '' && !validPrice ? 'Introduce un precio mayor que cero.' : undefined}
        >
          <div className="flex min-h-12 items-center gap-2">
            <input
              id="ingredient-canonical-new-price"
              inputMode="decimal"
              autoComplete="off"
              value={newPrice}
              onChange={(event) => setNewPrice(event.target.value)}
              aria-invalid={newPrice !== '' && !validPrice ? true : undefined}
              className="min-w-0 flex-1 font-mono tabular-nums"
            />
            <span className="shrink-0 text-sm font-bold text-zinc-600" aria-hidden>
              €/{unit}
            </span>
          </div>
        </Field>

        <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
          <p className="text-xs font-bold leading-snug text-zinc-800">
            Los albaranes {ingredient.price_locked ? 'no pueden' : 'pueden'} actualizar este precio
          </p>
        </div>
      </div>
    </Modal>
  )
}
