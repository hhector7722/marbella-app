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
  base_unit?: string | null
  density_g_per_ml?: number | null
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
  onSaved: (updated?: {
    currentPrice: number
    purchaseUnit: string
    baseUnit: string
    recipeUnit: string
    densityGPerMl: number | null
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
  const [newRecipeUnit, setNewRecipeUnit] = useState(() => ingredient.recipe_unit || ingredient.purchase_unit || 'ud')
  const [densityInput, setDensityInput] = useState(() =>
    ingredient.density_g_per_ml != null ? String(ingredient.density_g_per_ml).replace('.', ',') : ''
  )
  const [baselineRecipeUnit, setBaselineRecipeUnit] = useState(() => ingredient.recipe_unit || ingredient.purchase_unit || 'ud')
  const [baselineDensity, setBaselineDensity] = useState<number | null>(() => ingredient.density_g_per_ml ?? null)
  const [configLoading, setConfigLoading] = useState(true)
  const [baselineImageUrl, setBaselineImageUrl] = useState(ingredient.image_url ?? null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const parsedPrice = Number(newPrice.trim().replace(',', '.'))
  const validPrice = Number.isFinite(parsedPrice) && parsedPrice > 0
  const parsedDensity = densityInput.trim() === '' ? null : Number(densityInput.trim().replace(',', '.'))
  const validDensity = parsedDensity == null || (Number.isFinite(parsedDensity) && parsedDensity > 0)
  const baselinePrice =
    Number.isFinite(ingredient.current_price) && ingredient.current_price > 0
      ? ingredient.current_price
      : null
  const priceChanged =
    baselinePrice != null
      ? !(Number.isFinite(parsedPrice) && Math.abs(parsedPrice - baselinePrice) < 1e-9)
      : newPrice.trim() !== ''
  const unitChanged = newUnit !== (ingredient.purchase_unit || 'ud')
  const recipeUnitChanged = newRecipeUnit !== baselineRecipeUnit
  const densityChanged =
    baselineDensity == null || parsedDensity == null
      ? baselineDensity !== parsedDensity
      : Math.abs(baselineDensity - parsedDensity) >= 1e-9
  const imageChanged = selectedFile != null
  const canonicalChanged = priceChanged || unitChanged || recipeUnitChanged || densityChanged
  const canSave =
    (imageChanged && !canonicalChanged) ||
    (canonicalChanged && validPrice && validDensity)
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
    let active = true
    void getIngredientCanonicalConfigAction(ingredient.id).then((result) => {
      if (!active) return
      if (!result.ok) {
        toast.error(result.message)
        setConfigLoading(false)
        return
      }
      setNewPrice(priceInputValue(result.currentPrice))
      setNewUnit(result.purchaseUnit)
      setNewRecipeUnit(result.recipeUnit)
      setBaselineRecipeUnit(result.recipeUnit)
      setDensityInput(result.densityGPerMl == null ? '' : String(result.densityGPerMl).replace('.', ','))
      setBaselineDensity(result.densityGPerMl)
      setConfigLoading(false)
    })
    return () => {
      active = false
    }
  }, [ingredient.id])

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
    if (canonicalChanged && !validPrice) {
      toast.error('El precio debe ser mayor que cero.')
      return
    }
    if (canonicalChanged && !validDensity) {
      toast.error('La densidad debe ser mayor que cero o quedar vacía.')
      return
    }
    if (!imageChanged && !canonicalChanged) return

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

      if (!canonicalChanged) {
        toast.success('Imagen actualizada.')
        onSaved()
        onClose()
        return
      }

      const result = await setIngredientPriceAndUnitAction(
        ingredient.id,
        parsedPrice,
        newUnit,
        newRecipeUnit,
        parsedDensity,
      )
      if (!result.ok) {
        if (imagePersisted) {
          onSaved()
          toast.error(`La imagen se ha guardado, pero la configuración no: ${result.message}`)
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
      onSaved({
        currentPrice: result.currentPrice,
        purchaseUnit: result.purchaseUnit,
        baseUnit: result.baseUnit,
        recipeUnit: result.recipeUnit,
        densityGPerMl: result.densityGPerMl,
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
        title="Editar ingrediente"
        subtitle={ingredient.name}
        variant="amplify"
        layer={layer}
        parentInstance={parentInstance}
        instance="ingredient-canonical-price"
        usageId="ingredient-canonical-price"
        usageLabel="Editar ingrediente"
        scrollContent
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
              disabled={!canSave || configLoading}
              loading={saving}
              loadingLabel="Guardando"
              onClick={() => void save()}
            >
              Guardar
            </Button>
          </div>
        }
      >
        <div className="grid gap-5 md:grid-cols-[12rem_minmax(0,1fr)]">
          <aside className="space-y-3">
            <section className="overflow-hidden rounded-ds-superficie border border-ds-borde bg-zinc-50">
              <div className="flex aspect-square items-center justify-center overflow-hidden">
                {displayImageSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL de Storage o blob local
                  <img src={displayImageSrc} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Camera className="h-12 w-12 text-zinc-200" aria-hidden />
                )}
              </div>
            </section>

            <Button
              type="button"
              variant="secondary"
              instance="ingredient-canonical-photo"
              disabled={saving}
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
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

            <section className="rounded-ds-superficie border border-ds-borde bg-zinc-50/80 p-3">
              <p className="text-[11px] font-bold text-zinc-500">Precio actual</p>
              <p className="mt-1 font-mono text-xl font-black tabular-nums text-zinc-950">
                {formatPrice(ingredient.current_price)} €/{unit}
              </p>
              <p className="mt-2 text-[11px] font-semibold leading-snug text-zinc-500">
                Los albaranes {ingredient.price_locked ? 'no pueden' : 'pueden'} actualizar este precio.
              </p>
            </section>
          </aside>

          <div className="space-y-4">
            <section className="overflow-hidden rounded-ds-superficie border border-ds-borde bg-ds-superficie">
              <div className="border-b border-ds-borde bg-zinc-50/80 px-4 py-3">
                <h3 className="text-[11px] font-black uppercase tracking-[0.08em] text-zinc-700">
                  Compra
                </h3>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <Field
                  instance="ingredient-canonical-unit"
                  label="Unidad del precio"
                  htmlFor="ingredient-canonical-unit"
                >
                  <select
                    id="ingredient-canonical-unit"
                    value={newUnit}
                    onChange={(event) => setNewUnit(event.target.value)}
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
                  instance="ingredient-canonical-new-price"
                  label="Precio"
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
                    <span className="shrink-0 text-sm font-bold text-zinc-500" aria-hidden>
                      €/{unit}
                    </span>
                  </div>
                </Field>
              </div>
            </section>

            <section className="overflow-hidden rounded-ds-superficie border border-ds-borde bg-ds-superficie">
              <div className="border-b border-ds-borde bg-zinc-50/80 px-4 py-3">
                <h3 className="text-[11px] font-black uppercase tracking-[0.08em] text-zinc-700">
                  Uso en recetas
                </h3>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <Field
                  instance="ingredient-canonical-recipe-unit"
                  label="Unidad en recetas"
                  htmlFor="ingredient-canonical-recipe-unit"
                >
                  <select
                    id="ingredient-canonical-recipe-unit"
                    value={newRecipeUnit}
                    onChange={(event) => setNewRecipeUnit(event.target.value)}
                    disabled={configLoading}
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="cl">cl</option>
                    <option value="l">l</option>
                    <option value="ud">ud</option>
                  </select>
                </Field>

                <Field
                  instance="ingredient-canonical-density"
                  label="Densidad"
                  htmlFor="ingredient-canonical-density"
                  error={!validDensity ? 'Introduce gramos por ml, por ejemplo 1,40.' : undefined}
                  hint="Solo hace falta para convertir entre peso y volumen. Sin este dato no se inventa ninguna conversión g ↔ ml."
                >
                  <div className="flex min-h-12 items-center gap-2">
                    <span className="shrink-0 text-sm font-semibold text-zinc-500">1 ml =</span>
                    <input
                      id="ingredient-canonical-density"
                      inputMode="decimal"
                      autoComplete="off"
                      value={densityInput}
                      disabled={configLoading}
                      onChange={(event) => setDensityInput(event.target.value)}
                      className="min-w-0 flex-1 font-mono tabular-nums"
                    />
                    <span className="shrink-0 text-sm font-bold text-zinc-500">g</span>
                  </div>
                </Field>
              </div>
            </section>

            <section className="overflow-hidden rounded-ds-superficie border border-ds-borde bg-ds-superficie">
              <div className="border-b border-ds-borde bg-zinc-50/80 px-4 py-3">
                <h3 className="text-[11px] font-black uppercase tracking-[0.08em] text-zinc-700">
                  Catálogo
                </h3>
              </div>
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-black text-zinc-900">
                    {isArchived ? 'Ingrediente archivado' : 'Ingrediente activo'}
                  </p>
                  <p className="mt-1 text-xs font-medium leading-snug text-zinc-500">
                    {isArchived
                      ? 'Está fuera de catálogos, recetas, pedidos y mapeos, pero conserva todo su histórico.'
                      : 'Archivar lo retira de catálogos, recetas, pedidos y mapeos sin borrar su histórico.'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={isArchived ? 'secondary' : 'destructive'}
                  instance="ingredient-canonical-archive"
                  disabled={archiving}
                  onClick={() => setConfirmArchive(true)}
                  className="shrink-0"
                >
                  {isArchived ? 'Reactivar' : 'Archivar'}
                </Button>
              </div>
            </section>
          </div>
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
