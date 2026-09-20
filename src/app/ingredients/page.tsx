'use client'

import { useEffect, useState } from 'react'
import { Package, Plus } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { IngredientCreateForm } from '@/components/ingredients/IngredientCreateForm'
import {
  IngredientCanonicalEditModal,
  type Ingredient,
} from '@/components/ingredients/IngredientCanonicalEditModal'
import { resolveSupplierPickerItems } from '@/lib/supplier-seed'
import { Modal } from '@/components/ui/modal'
import { SearchField } from '@/components/ui/SearchField'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { CatalogGrid, CatalogTileUnificado } from '@/components/catalog/CatalogTile'
import { CatalogFilterChip } from '@/components/catalog/CatalogFilterChip'

export default function IngredientsPage() {
  const supabase = createClient()
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null)
  const [showSupplierPopup, setShowSupplierPopup] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [allSuppliers, setAllSuppliers] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    void fetchIngredients()
    void fetchSuppliers()
  }, [])

  async function fetchIngredients() {
    setLoading(true)
    const { data, error } = await supabase.from('ingredients').select('*').order('name')
    if (error) toast.error('No se pudieron cargar los ingredientes')
    setIngredients((data ?? []) as Ingredient[])
    setLoading(false)
  }

  async function fetchSuppliers() {
    const { data, error } = await supabase.from('suppliers').select('id,name').order('name')
    if (error) {
      toast.error('No se pudieron cargar los proveedores')
      return
    }

    const rows = (data ?? [])
      .map((row) => ({
        id: String(row.id),
        name: String(row.name ?? '').trim(),
      }))
      .filter((row) => row.name)

    setAllSuppliers(resolveSupplierPickerItems(rows))
  }

  useEffect(() => {
    if (selectedSupplier && !allSuppliers.some((supplier) => supplier.name === selectedSupplier)) {
      setSelectedSupplier(null)
    }
  }, [allSuppliers, selectedSupplier])

  const filteredIngredients = ingredients.filter((ingredient) => {
    const matchesSearch = ingredient.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSupplier =
      !selectedSupplier ||
      ingredient.supplier === selectedSupplier ||
      ingredient.supplier_2 === selectedSupplier
    return matchesSearch && matchesSupplier
  })

  return (
    <>
      <Toaster position="top-right" />

      <DashboardDetailLayout
        title="Ingredientes"
        titleFace="display"
        titleBlockClassName="w-full text-center"
        showBackButton={false}
        template="list"
        maxWidthClass="max-w-7xl"
        toolbarSlot={
          <div className="flex flex-row items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition-all hover:bg-emerald-600 hover:shadow"
              aria-label="Crear nuevo ingrediente"
            >
              <Plus size={16} strokeWidth={3} />
            </button>

            <div className="min-w-0 flex-1">
              <SearchField
                instance="ingredients-search"
                placeholder="Buscar ingrediente..."
                value={searchQuery}
                onChange={setSearchQuery}
              />
            </div>

            <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
              {!selectedSupplier ? (
                <CatalogFilterChip label="PROV" onOpen={() => setShowSupplierPopup(true)} />
              ) : (
                <CatalogFilterChip
                  label="PROV"
                  value={selectedSupplier}
                  onClear={() => setSelectedSupplier(null)}
                />
              )}
            </div>
          </div>
        }
      >
        {loading ? (
          <div className="flex min-h-40 items-center justify-center">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <div className="pt-1">
            <CatalogGrid columns={4}>
              {filteredIngredients.map((ingredient) => (
                <CatalogTileUnificado
                  key={ingredient.id}
                  title={ingredient.name}
                  imageSrc={ingredient.image_url}
                  fallback={<Package className="h-8 w-8 md:h-10 md:w-10" />}
                  price={ingredient.current_price ?? undefined}
                  priceLocked={ingredient.price_locked ?? false}
                  onClick={() => setEditingIngredient(ingredient)}
                />
              ))}
            </CatalogGrid>
          </div>
        )}
      </DashboardDetailLayout>

      {editingIngredient ? (
        <IngredientCanonicalEditModal
          key={editingIngredient.id}
          ingredient={editingIngredient}
          onClose={() => setEditingIngredient(null)}
          onSaved={() => void fetchIngredients()}
        />
      ) : null}

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        variant="compact"
        layer="base"
        instance="ingredient-create"
        usageId="ingredient-create"
        usageLabel="Crear ingrediente"
        title="Nuevo ingrediente"
        headerTone="petroleum"
      >
        <IngredientCreateForm
          onCreated={async () => {
            setShowCreateModal(false)
            await fetchIngredients()
          }}
          onClose={() => setShowCreateModal(false)}
        />
      </Modal>

      <Modal
        open={showSupplierPopup}
        onClose={() => setShowSupplierPopup(false)}
        title="Proveedor"
        variant="compact"
        layer="base"
        instance="ingredients-supplier-filter"
        usageId="ingredients-supplier-filter"
        usageLabel="Filtro proveedor ingredientes"
      >
        <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
          <button
            type="button"
            onClick={() => {
              setSelectedSupplier(null)
              setShowSupplierPopup(false)
            }}
            className="min-h-12 w-full py-2.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Todos
          </button>

          {allSuppliers.length === 0 ? (
            <p className="py-2.5 text-xs font-medium text-zinc-400">
              No hay proveedores en la base de datos
            </p>
          ) : (
            allSuppliers.map((supplier) => (
              <button
                key={supplier.id}
                type="button"
                onClick={() => {
                  setSelectedSupplier(supplier.name)
                  setShowSupplierPopup(false)
                }}
                className="min-h-12 w-full py-2.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                {supplier.name}
              </button>
            ))
          )}
        </div>
      </Modal>
    </>
  )
}
