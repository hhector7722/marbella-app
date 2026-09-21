'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/modal'
import {
  setIngredientArchivedAction,
  setIngredientCurrentPriceAction,
} from '@/app/ingredients/actions'
export interface Ingredient {
  id: string
  name: string
  current_price: number
  purchase_unit: string
  price_locked?: boolean
  supplier?: string | null
  supplier_2?: string | null
  unit_type?: string
  category?: string
  waste_percentage?: number
  image_url?: string | null
  allergens?: string[]
  order_unit?: string | null
  recipe_unit?: string | null
  recommended_stock?: number | null
  archived_at?: string | null
}

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
  const [archiving, setArchiving] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const parsedPrice = Number(newPrice.trim().replace(',', '.'))
  const validPrice = Number.isFinite(parsedPrice) && parsedPrice > 0
  const unit = ingredient.purchase_unit || 'ud'
  const isArchived = Boolean(ingredient.archived_at)

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

  async function setArchived(archived: boolean) {
    setArchiving(true)
    try {
      const result = await setIngredientArchivedAction(ingredient.id, archived)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(archived ? 'Ingrediente archivado.' : 'Ingrediente reactivado.')
      setConfirmArchive(false)
      onSaved()
      onClose()
    } finally {
      setArchiving(false)
    }
  }

  return (
    <>
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

        <section aria-labelledby="ingredient-archive" className="space-y-2 border-t border-zinc-100 pt-4">
          <h2 id="ingredient-archive" className="text-xs font-bold text-zinc-500">
            Catálogo
          </h2>
          <p className="text-xs font-medium leading-snug text-zinc-500">
            {isArchived
              ? 'Este ingrediente está archivado: no se ofrece en catálogos, recetas, pedidos ni mapeos, pero su histórico se conserva.'
              : 'Archivar lo retira de catálogos, recetas, pedidos y mapeos sin borrar su histórico.'}
          </p>
          <Button
            type="button"
            variant={isArchived ? 'secondary' : 'destructive'}
            instance="ingredient-canonical-archive"
            disabled={archiving}
            onClick={() => setConfirmArchive(true)}
          >
            {isArchived ? 'Reactivar' : 'Archivar'}
          </Button>
        </section>
      </div>
      </Modal>

      <ConfirmModal
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title={isArchived ? 'Reactivar ingrediente' : 'Archivar ingrediente'}
        confirmLabel={isArchived ? 'Reactivar' : 'Archivar'}
        confirmVariant={isArchived ? 'primary' : 'destructive'}
        onConfirm={() => void setArchived(!isArchived)}
        instance="ingredient-canonical-archive-confirm"
        usageLabel={isArchived ? 'Reactivar ingrediente' : 'Archivar ingrediente'}
        parentInstance="ingredient-canonical-price"
        confirming={archiving}
      >
        {isArchived
          ? `"${ingredient.name}" volverá a ofrecerse en catálogos, recetas, pedidos y mapeos.`
          : `"${ingredient.name}" dejará de ofrecerse en catálogos, recetas, pedidos y mapeos. No se borra ningún dato ni histórico.`}
      </ConfirmModal>
    </>
  )
}
