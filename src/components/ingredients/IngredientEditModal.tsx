'use client'

import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/Field'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { setIngredientCanonicalPriceAction } from '@/app/ingredients/actions'
import { RECIPE_UNIT_OPTIONS, resolveIngredientRecipeUnit } from '@/lib/recipe-cost'

export interface Ingredient {
  id: string
  name: string
  supplier: string | null
  supplier_2?: string | null
  current_price: number
  purchase_unit: string
  unit_type: string
  category: string
  waste_percentage: number
  image_url: string | null
  allergens: string[]
  order_unit?: string | null
  recipe_unit?: string | null
  recommended_stock?: number | null
  price_locked?: boolean
  supplier_pricing_mode?: 'per_purchase_unit' | 'per_pack'
  pack_price?: number | null
  pack_units?: number | null
  pack_unit_size_qty?: number | null
  pack_unit_size_unit?: string | null
}

const ORDER_UNITS = ['pack', 'caja', 'ud', 'kg', 'pieza', 'l', 'g', 'ml', 'cl']
const CATEGORIES = ['Alimentos', 'Packaging', 'Bebidas', 'Limpieza', 'Otros']

export type IngredientEditModalProps = {
  ingredient: Ingredient | null
  onClose: () => void
  onSaved: () => void
  navigationIngredients?: Ingredient[]
}

export function IngredientEditModal({
  ingredient,
  onClose,
  onSaved,
  navigationIngredients,
}: IngredientEditModalProps) {
  const supabase = createClient()
  const [activeIngredient, setActiveIngredient] = useState<Ingredient | null>(null)
  const [editForm, setEditForm] = useState<Partial<Ingredient>>({})
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [allSuppliers, setAllSuppliers] = useState<Array<{ id: string; name: string }>>([])

  const navList = useMemo(() => {
    if (navigationIngredients?.length) return navigationIngredients
    return activeIngredient ? [activeIngredient] : []
  }, [navigationIngredients, activeIngredient])

  const ingredientId = ingredient?.id ?? null

  useLayoutEffect(() => {
    if (!ingredientId || !ingredient) {
      setActiveIngredient(null)
      setEditForm({})
      return
    }
    setActiveIngredient(ingredient)
    setEditForm({ ...ingredient })
  }, [ingredientId, ingredient])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.from('suppliers').select('id,name').order('name')
      if (cancelled) return
      if (error) {
        toast.error('No se pudieron cargar los proveedores')
        return
      }
      setAllSuppliers(
        (data ?? [])
          .map((row) => ({ id: String(row.id), name: String(row.name ?? '').trim() }))
          .filter((row) => row.name)
      )
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  function applyIngredientToForm(next: Ingredient) {
    setActiveIngredient(next)
    setEditForm({ ...next })
  }

  function navigateIngredient(direction: -1 | 1) {
    if (!activeIngredient || navList.length <= 1) return
    const currentIndex = navList.findIndex((item) => item.id === activeIngredient.id)
    if (currentIndex < 0) return
    const nextIndex = (currentIndex + direction + navList.length) % navList.length
    applyIngredientToForm(navList[nextIndex])
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const rowId = activeIngredient?.id ?? ingredient?.id
    if (!file || !rowId) return

    setUploadingImage(true)
    try {
      const extension = file.name.split('.').pop()
      const filename = 'ing-' + Date.now() + '.' + extension
      const { error: uploadError } = await supabase.storage
        .from('ingredients')
        .upload(filename, file, { upsert: true })
      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from('ingredients').getPublicUrl(filename)

      const { error } = await supabase
        .from('ingredients')
        .update({ image_url: publicUrl })
        .eq('id', rowId)
      if (error) throw error

      setEditForm((previous) => ({ ...previous, image_url: publicUrl }))
      toast.success('Imagen subida')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir la imagen')
    } finally {
      setUploadingImage(false)
    }
  }

  async function handleSaveEdit() {
    const rowId = activeIngredient?.id ?? ingredient?.id
    if (!rowId) return

    const currentPrice = Number(editForm.current_price)
    if (!Number.isFinite(currentPrice) || currentPrice < 0) {
      toast.error('Precio inválido')
      return
    }

    setSaving(true)
    try {
      const priceResult = await setIngredientCanonicalPriceAction({
        ingredientId: rowId,
        currentPrice,
        priceLocked: editForm.price_locked === true,
        reason: 'Edición manual desde Ingredientes',
      })
      if (!priceResult.success) throw new Error(priceResult.message)

      const purchaseUnit = String(activeIngredient?.purchase_unit ?? editForm.purchase_unit ?? 'kg')
      const { error } = await supabase
        .from('ingredients')
        .update({
          name: String(editForm.name ?? '').trim(),
          supplier: editForm.supplier || null,
          supplier_2: editForm.supplier_2 || null,
          category: editForm.category || 'Alimentos',
          waste_percentage: Number(editForm.waste_percentage ?? 0) || 0,
          image_url: editForm.image_url ?? null,
          order_unit: editForm.order_unit || 'unidad',
          recipe_unit: resolveIngredientRecipeUnit(editForm.recipe_unit, purchaseUnit),
          recommended_stock:
            editForm.recommended_stock == null || !Number.isFinite(Number(editForm.recommended_stock))
              ? null
              : Number(editForm.recommended_stock),
        })
        .eq('id', rowId)

      if (error) throw error

      toast.success('Guardado')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteIngredient() {
    const rowId = activeIngredient?.id ?? ingredient?.id
    if (!rowId) return
    setIsDeleting(true)
    try {
      const { error } = await supabase.from('ingredients').delete().eq('id', rowId)
      if (error) throw error
      toast.success('Eliminado')
      setDeleteConfirmOpen(false)
      onSaved()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar')
    } finally {
      setIsDeleting(false)
    }
  }

  if (!ingredient || !activeIngredient) return null

  const purchaseUnit = String(activeIngredient.purchase_unit || 'kg').toLowerCase()

  return (
    <>
      <Modal
        open
        onClose={onClose}
        variant="standard"
        layer="base"
        instance="ingredient-edit"
        usageId="ingredient-edit"
        usageLabel="Editar ingrediente"
        title="Editar"
        headerTone="petroleum"
        scrollContent
        footer={
          <>
            <Button
              type="button"
              variant="destructive"
              instance="ingredient-edit-delete"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              Eliminar
            </Button>
            <Button
              type="button"
              variant="primary"
              instance="ingredient-edit-save"
              onClick={() => void handleSaveEdit()}
              disabled={saving}
              loading={saving}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-8">
            {navList.length > 1 ? (
              <Button
                type="button"
                variant="tertiary"
                instance="ingredient-edit-prev"
                icon={<ChevronLeft />}
                aria-label="Ingrediente anterior"
                onClick={() => navigateIngredient(-1)}
              />
            ) : (
              <div className="h-12 w-12" aria-hidden />
            )}

            <div className="group relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-white">
              {editForm.image_url ? (
                <img src={editForm.image_url} alt="" className="h-full w-full object-contain" />
              ) : (
                <Camera className="h-8 w-8 text-gray-400" />
              )}
              <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
                CAMBIAR
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                />
              </label>
            </div>

            {navList.length > 1 ? (
              <Button
                type="button"
                variant="tertiary"
                instance="ingredient-edit-next"
                icon={<ChevronRight />}
                aria-label="Ingrediente siguiente"
                onClick={() => navigateIngredient(1)}
              />
            ) : (
              <div className="h-12 w-12" aria-hidden />
            )}
          </div>

          <Field instance="ingredient-edit-name" label="Nombre" htmlFor="ingredient-edit-name">
            <input
              id="ingredient-edit-name"
              value={editForm.name ?? ''}
              onChange={(event) => setEditForm((previous) => ({ ...previous, name: event.target.value }))}
            />
          </Field>

          <div className="rounded-2xl border border-[#36606F]/15 bg-[#36606F]/5 p-3">
            <div className="text-[10px] font-black uppercase tracking-wider text-[#36606F]">
              Precio canónico
            </div>
            <div className="mt-1 text-xs text-zinc-600">
              Es el único precio del ingrediente. Los albaranes y los cambios manuales terminan en este mismo valor.
            </div>
            <div className="mt-3 flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-bold text-zinc-800">
                  {'Precio actual (€/' + purchaseUnit + ')'}
                </span>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  inputMode="decimal"
                  value={editForm.current_price ?? ''}
                  onChange={(event) => {
                    const value = Number(String(event.target.value).replace(',', '.'))
                    setEditForm((previous) => ({
                      ...previous,
                      current_price: Number.isFinite(value) ? value : 0,
                    }))
                  }}
                  className="min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 font-mono font-bold"
                />
              </label>
              <div className="flex min-h-12 min-w-16 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black text-zinc-700">
                {'€/' + purchaseUnit}
              </div>
            </div>
            <label className="mt-3 flex min-h-12 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3">
              <input
                type="checkbox"
                checked={editForm.price_locked === true}
                onChange={(event) =>
                  setEditForm((previous) => ({ ...previous, price_locked: event.target.checked }))
                }
                className="h-4 w-4"
              />
              <span className="text-sm font-semibold text-zinc-800">
                Precio fijo: los albaranes no lo modifican
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field instance="ingredient-edit-category" label="Categoría" htmlFor="ingredient-edit-category">
              <select
                id="ingredient-edit-category"
                value={editForm.category ?? 'Alimentos'}
                onChange={(event) =>
                  setEditForm((previous) => ({ ...previous, category: event.target.value }))
                }
              >
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>

            <Field instance="ingredient-edit-waste" label="% Merma" htmlFor="ingredient-edit-waste">
              <input
                id="ingredient-edit-waste"
                type="number"
                step="0.01"
                value={editForm.waste_percentage ?? ''}
                onChange={(event) =>
                  setEditForm((previous) => ({
                    ...previous,
                    waste_percentage: Number(event.target.value) || 0,
                  }))
                }
              />
            </Field>

            <Field instance="ingredient-edit-order-unit" label="U. Pedido" htmlFor="ingredient-edit-order-unit">
              <select
                id="ingredient-edit-order-unit"
                value={editForm.order_unit || 'unidad'}
                onChange={(event) =>
                  setEditForm((previous) => ({ ...previous, order_unit: event.target.value }))
                }
              >
                {ORDER_UNITS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>

            <Field instance="ingredient-edit-recipe-unit" label="U. receta" htmlFor="ingredient-edit-recipe-unit">
              <select
                id="ingredient-edit-recipe-unit"
                value={resolveIngredientRecipeUnit(editForm.recipe_unit, purchaseUnit)}
                onChange={(event) =>
                  setEditForm((previous) => ({ ...previous, recipe_unit: event.target.value }))
                }
              >
                {RECIPE_UNIT_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field instance="ingredient-edit-stock" label="Stock Rec." htmlFor="ingredient-edit-stock">
              <input
                id="ingredient-edit-stock"
                type="number"
                step="1"
                value={editForm.recommended_stock ?? ''}
                onChange={(event) => {
                  const value = event.target.value === '' ? null : Number(event.target.value)
                  setEditForm((previous) => ({
                    ...previous,
                    recommended_stock: value != null && Number.isFinite(value) ? value : null,
                  }))
                }}
              />
            </Field>
          </div>

          <Field instance="ingredient-edit-supplier" label="Proveedor" htmlFor="ingredient-edit-supplier">
            <select
              id="ingredient-edit-supplier"
              value={editForm.supplier || ''}
              onChange={(event) =>
                setEditForm((previous) => ({ ...previous, supplier: event.target.value || null }))
              }
            >
              <option value="">Sin proveedor fijo</option>
              {allSuppliers.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>

          <Field instance="ingredient-edit-supplier-2" label="Proveedor 2" htmlFor="ingredient-edit-supplier-2">
            <select
              id="ingredient-edit-supplier-2"
              value={editForm.supplier_2 || ''}
              onChange={(event) =>
                setEditForm((previous) => ({ ...previous, supplier_2: event.target.value || null }))
              }
            >
              <option value="">Sin segundo proveedor</option>
              {allSuppliers.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>

      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => {
          if (!isDeleting) setDeleteConfirmOpen(false)
        }}
        title="Eliminar ingrediente"
        confirmLabel="Eliminar"
        instance="ingredient-delete-confirm"
        parentInstance="ingredient-edit"
        usageLabel="Confirmar eliminar ingrediente"
        confirming={isDeleting}
        onConfirm={() => void handleDeleteIngredient()}
      >
        {'¿Seguro que quieres eliminar "' + String(editForm.name ?? '') + '"? Esta acción no se puede deshacer.'}
      </ConfirmModal>
    </>
  )
}
