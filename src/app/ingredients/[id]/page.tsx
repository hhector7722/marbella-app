'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Package, Pencil } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import {
  IngredientCanonicalEditModal,
  type Ingredient,
} from '@/components/ingredients/IngredientCanonicalEditModal'
import { IngredientActivitySummary } from '@/components/ingredients/IngredientActivitySummary'
import { IngredientHistoryModal } from '@/components/ingredients/IngredientHistoryModal'
import { IngredientFact, IngredientPanel } from '@/components/ingredients/IngredientPanel'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { CatalogSquare } from '@/components/catalog/CatalogTile'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import {
  ACTIVITY_PERIOD_DAYS,
  mapIngredientActivity,
  type IngredientActivity,
} from '@/lib/ingredient-activity'

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

export default function IngredientDetailPage() {
  const params = useParams()
  const ingredientId = String(params.id ?? '')
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [ingredient, setIngredient] = useState<Ingredient | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [activity, setActivity] = useState<IngredientActivity | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

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

  const fetchActivity = useCallback(async () => {
    if (!ingredientId) return

    setActivityLoading(true)
    const { data, error } = await supabase.rpc('get_ingredient_activity', {
      p_ingredient_id: ingredientId,
      p_days: ACTIVITY_PERIOD_DAYS,
    })

    if (error) {
      toast.error('No se pudo cargar la actividad')
      setActivity(null)
    } else {
      setActivity(mapIngredientActivity(data))
    }
    setActivityLoading(false)
  }, [ingredientId, supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial del ingrediente y su actividad
    void fetchIngredient()
    void fetchActivity()
  }, [fetchActivity, fetchIngredient])

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

          <IngredientPanel
            title="Actividad"
            trailing={
              <span className="text-[11px] font-medium text-white/70">
                {ACTIVITY_PERIOD_DAYS} días
              </span>
            }
          >
            <IngredientActivitySummary
              activity={activity}
              loading={activityLoading}
              onOpenHistory={() => setHistoryOpen(true)}
            />
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
            void fetchActivity()
            setHistoryRefreshKey((key) => key + 1)
          }}
        />
      ) : null}

      <IngredientHistoryModal
        key={`${ingredient.id}:${historyRefreshKey}`}
        ingredientId={ingredient.id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  )
}
