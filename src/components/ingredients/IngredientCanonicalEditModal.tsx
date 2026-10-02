'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import {
  getIngredientCanonicalConfigAction,
  setIngredientArchivedAction,
  setIngredientPriceAndUnitAction,
  uploadIngredientPhotoAction,
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
  density_g_per_ml?: number | null
  base_unit?: string | null
  recommended_stock?: number | null
  archived_at?: string | null
}

type Props = {
  ingredient: Ingredient
  onClose: () => void
  onSaved: (updated?: {
    currentPrice: number
    purchaseUnit: string
    recipeUnit: string
    densityGPerMl: number | null
    baseUnit: string
  }) => void
  layer?: 'base' | 'derived'
  parentInstance?: string
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

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function isAllowedImage(file: File): boolean {
  if (ALLOWED_IMAGE_TYPES.has(file.type)) return true
  if (file.type) return false
  return /\.(jpe?g|png|webp)$/i.test(file.name)
}

export function IngredientCanonicalEditModal({
  ingredient,
  onClose,
  onSaved,
  layer = 'base',
  parentInstance,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const stagedBlobRef = useRef<string | null>(null)
  const [newPrice, setNewPrice] = useState(() => priceInputValue(ingredient.current_price))
  const [newUnit, setNewUnit] = useState(() => ingredient.purchase_unit || 'ud')
  const [recipeUnit, setRecipeUnit] = useState(() => ingredient.recipe_unit || ingredient.purchase_unit || 'ud')
  const [densityDraft, setDensityDraft] = useState(() =>
    ingredient.density_g_per_ml != null ? String(ingredient.density_g_per_ml).replace('.', ',') : ''
  )
  const [baselineRecipeUnit, setBaselineRecipeUnit] = useState(() => ingredient.recipe_unit || ingredient.purchase_unit || 'ud')
  const [baselineDensity, setBaselineDensity] = useState<number | null>(() =>
    ingredient.density_g_per_ml != null ? Number(ingredient.density_g_per_ml) : null
  )
  const [baselineImageUrl, setBaselineImageUrl] = useState(ingredient.image_url ?? null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getIngredientCanonicalConfigAction(ingredient.id).then((result) => {
      if (cancelled || !result.ok) return
      const current = result.ingredient
      setNewPrice(priceInputValue(current.currentPrice))
      setNewUnit(current.purchaseUnit)
      setRecipeUnit(current.recipeUnit)
      setBaselineRecipeUnit(current.recipeUnit)
      setBaselineDensity(current.densityGPerMl)
      setDensityDraft(current.densityGPerMl != null ? String(current.densityGPerMl).replace('.', ',') : '')
    })
    return () => { cancelled = true }
  }, [ingredient.id])

  const parsedPrice = Number(newPrice.trim().replace(',', '.'))
  const validPrice = Number.isFinite(parsedPrice) && parsedPrice > 0
  const baselinePrice =
    Number.isFinite(ingredient.current_price) && ingredient.current_price > 0
      ? ingredient.current_price
      : null
  const priceChanged =
    baselinePrice != null
      ? !(Number.isFinite(parsedPrice) && Math.abs(parsedPrice - baselinePrice) < 1e-9)
      : newPrice.trim() !== ''
  const unitChanged = newUnit !== (ingredient.purchase_unit || 'ud')
  const recipeUnitChanged = recipeUnit !== baselineRecipeUnit
  const parsedDensity = densityDraft.trim() === '' ? null : Number(densityDraft.trim().replace(',', '.'))
  const validDensity = parsedDensity == null || (Number.isFinite(parsedDensity) && parsedDensity > 0)
  const densityChanged =
    (baselineDensity == null) !== (parsedDensity == null)
    || (baselineDensity != null && parsedDensity != null && Math.abs(baselineDensity - parsedDensity) >= 1e-9)
  const unitDimension = (value: string) => {
    const unit = String(value ?? '').trim().toLowerCase()
    if (unit === 'kg' || unit === 'g') return 'mass'
    if (unit === 'l' || unit === 'ml' || unit === 'cl') return 'volume'
    if (unit === 'ud') return 'count'
    return null
  }
  const purchaseDimension = unitDimension(newUnit)
  const recipeDimension = unitDimension(recipeUnit)
  const needsDensity =
    (purchaseDimension === 'mass' && recipeDimension === 'volume')
    || (purchaseDimension === 'volume' && recipeDimension === 'mass')
  const densityReady = !needsDensity || (parsedDensity != null && validDensity)
  const imageChanged = selectedFile != null
  const configChanged = priceChanged || unitChanged || recipeUnitChanged || densityChanged
  const canSave =
    (imageChanged && !configChanged) ||
    (configChanged && validPrice && validDensity && densityReady)
  const unit = newUnit || 'ud'
  const isArchived = Boolean(ingredient.archived_at)
  const displayImageSrc = previewBlobUrl ?? baselineImageUrl

  function revokeStagedBlob() {
    if (stagedBlobRef.current) {
      URL.revokeObjectURL(stagedBlobRef.current)
      stagedBlobRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      if (stagedBlobRef.current) URL.revokeObjectURL(stagedBlobRef.current)
    }
  }, [])

  function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!file) return

    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('La imagen es muy grande (máx. 10 MB)')
      return
    }
    if (!isAllowedImage(file)) {
      toast.error('Formato no válido. Usa JPG, PNG o WebP.')
      return
    }

    revokeStagedBlob()
    const url = URL.createObjectURL(file)
    stagedBlobRef.current = url
    setPreviewBlobUrl(url)
    setSelectedFile(file)
  }

  function clearStagedImage() {
    revokeStagedBlob()
    setPreviewBlobUrl(null)
    setSelectedFile(null)
  }

  async function save() {
    if (configChanged && !validPrice) {
      toast.error('El precio debe ser mayor que cero.')
      return
    }
    if (!validDensity) {
      toast.error('La densidad debe ser un número mayor que cero.')
      return
    }
    if (needsDensity && parsedDensity == null) {
      toast.error('Indica la densidad en g/ml para convertir entre masa y volumen.')
      return
    }
    if (!imageChanged && !configChanged) return

    setSaving(true)
    try {
      let imagePersisted = false

      if (selectedFile) {
        const formData = new FormData()
        formData.append('file', selectedFile)
        const photo = await uploadIngredientPhotoAction(ingredient.id, formData)
        if (!photo.ok) {
          toast.error(photo.message)
          return
        }
        imagePersisted = true
        setBaselineImageUrl(photo.imageUrl)
        clearStagedImage()
      }

      if (!configChanged) {
        toast.success('Imagen actualizada.')
        onSaved()
        onClose()
        return
      }

      const result = await setIngredientPriceAndUnitAction(
        ingredient.id,
        parsedPrice,
        newUnit,
        recipeUnit,
        parsedDensity,
      )
      if (!result.ok) {
        if (imagePersisted) {
          onSaved()
          toast.error(`La imagen se ha guardado, pero precio/unidad no: ${result.message}`)
        } else {
          toast.error(result.message)
        }
        return
      }

      if (imagePersisted) toast.success('Imagen actualizada.')
      if (result.priceChanged || result.unitChanged || result.recipeUnitChanged || result.densityChanged) {
        toast.success('Ingrediente actualizado.')
      } else {
        toast.success('El ingrediente ya estaba actualizado.')
      }
      setBaselineRecipeUnit(result.recipeUnit)
      setBaselineDensity(result.densityGPerMl)
      onSaved({
        currentPrice: result.currentPrice,
        purchaseUnit: result.purchaseUnit,
        recipeUnit: result.recipeUnit,
        densityGPerMl: result.densityGPerMl,
        baseUnit: result.baseUnit,
      })
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
        layer={layer}
        parentInstance={parentInstance}
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
              disabled={!canSave}
              loading={saving}
              loadingLabel="Guardando"
              onClick={() => void save()}
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
          instance="ingredient-canonical-unit"
          label="Unidad del precio"
          htmlFor="ingredient-canonical-unit"
        >
          <select
            id="ingredient-canonical-unit"
            value={newUnit}
            onChange={(event) => setNewUnit(event.target.value)}
            className="min-h-12 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#36606F]/50"
          >
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="l">l</option>
            <option value="ml">ml</option>
            <option value="cl">cl</option>
            <option value="ud">ud</option>
          </select>
        </Field>

        <Field
          instance="ingredient-canonical-recipe-unit"
          label="Unidad por defecto en recetas"
          htmlFor="ingredient-canonical-recipe-unit"
        >
          <select
            id="ingredient-canonical-recipe-unit"
            value={recipeUnit}
            onChange={(event) => setRecipeUnit(event.target.value)}
            className="min-h-12 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#36606F]/50"
          >
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="l">l</option>
            <option value="ml">ml</option>
            <option value="cl">cl</option>
            <option value="ud">ud</option>
          </select>
        </Field>

        {needsDensity ? (
          <Field
            instance="ingredient-canonical-density"
            label="Densidad"
            htmlFor="ingredient-canonical-density"
            error={!validDensity || parsedDensity == null ? 'Necesaria para convertir masa ↔ volumen.' : undefined}
          >
            <div className="flex min-h-12 items-center gap-2">
              <input
                id="ingredient-canonical-density"
                inputMode="decimal"
                autoComplete="off"
                value={densityDraft}
                onChange={(event) => setDensityDraft(event.target.value)}
                className="min-w-0 flex-1 font-mono tabular-nums"
                placeholder="1,40"
              />
              <span className="shrink-0 text-sm font-bold text-zinc-600">g/ml</span>
            </div>
            <p className="mt-1 text-[11px] font-medium leading-snug text-zinc-500">
              Permite comprar por peso y usar el ingrediente por volumen en recetas.
            </p>
          </Field>
        ) : null}

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

        <section aria-labelledby="ingredient-image" className="space-y-2">
          <h2 id="ingredient-image" className="text-xs font-bold text-zinc-500">
            Imagen
          </h2>
          <div
            className={cn(
              'flex aspect-[4/5] h-40 w-auto items-center justify-center overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50',
            )}
          >
            {displayImageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL de Storage o blob local
              <img src={displayImageSrc} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <Camera className="h-10 w-10 text-zinc-200" aria-hidden />
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            instance="ingredient-canonical-photo"
            disabled={saving}
            onClick={() => fileInputRef.current?.click()}
          >
            {baselineImageUrl || selectedFile ? 'Cambiar imagen' : 'Añadir imagen'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={pickImage}
          />
        </section>

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
