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

  useEffect(() => {
    void fetchIngredient()
  }, [fetchIngredient])

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
  const allergens = Array.isArray(ingredient.allergens)
    ? ingredient.allergens.filter((item) => String(item).trim())
    : []

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

          <IngredientPanel title="Estado">
            <div className="space-y-5">
              <IngredientFact label="Catálogo">
                <span className={ingredient.archived_at ? 'text-amber-700' : 'text-emerald-700'}>
                  {ingredient.archived_at ? 'Archivado' : 'Activo'}
                </span>
              </IngredientFact>

              <div>
                {allergens.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {allergens.map((allergen) => (
                      <span
                        key={allergen}
                        className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-700"
                      >
                        {allergen}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm font-black text-gray-800">—</div>
                )}
                <div data-element="field-label">Alérgenos</div>
              </div>
            </div>
          </IngredientPanel>
        </div>
      </DashboardDetailLayout>

      {editing ? (
        <IngredientCanonicalEditModal
          key={ingredient.id}
          ingredient={ingredient}
          onClose={() => setEditing(false)}
          onSaved={() => void fetchIngredient()}
        />
      ) : null}
    </>
  )
}
