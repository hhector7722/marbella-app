'use client'

import { useEffect, useState } from 'react'
import { Package, Plus } from 'lucide-react'
import { Toaster } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { IngredientWizard } from '@/components/ingredients/IngredientWizard'
import { IngredientEditModal, type Ingredient } from '@/components/ingredients/IngredientEditModal'
import { Modal } from '@/components/ui/modal'
import { SearchField } from '@/components/ui/SearchField'
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
  const [allSuppliers, setAllSuppliers] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    void fetchIngredients()
    void fetchSuppliers()
  }, [])

  async function fetchIngredients() {
    setLoading(true)
    const { data } = await supabase.from('ingredients').select('*').order('name')
    setIngredients((data as Ingredient[] | null) ?? [])
    setLoading(false)
  }

  async function fetchSuppliers() {
    const { data } = await supabase.from('suppliers').select('id,name').order('name')
    setAllSuppliers(
      (data ?? [])
        .map((row) => ({ id: String(row.id), name: String(row.name ?? '').trim() }))
        .filter((row) => row.name)
    )
  }

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
        }
      >
        {!loading ? (
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
        ) : null}
      </DashboardDetailLayout>

      {editingIngredient ? (
        <IngredientEditModal
          key={editingIngredient.id}
          ingredient={editingIngredient}
          onClose={() => setEditingIngredient(null)}
          onSaved={() => void fetchIngredients()}
          navigationIngredients={filteredIngredients}
        />
      ) : null}

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        variant="standard"
        layer="base"
        instance="ingredient-create"
        usageId="ingredient-create"
        usageLabel="Crear ingrediente"
        title="Nuevo ingrediente"
        headerTone="petroleum"
        scrollContent
      >
        <IngredientWizard
          onSaved={() => {
            setShowCreateModal(false)
            void fetchIngredients()
          }}
          onClose={() => setShowCreateModal(false)}
        />
      </Modal>

      <Modal
        open={showSupplierPopup}
        onClose={() => setShowSupplierPopup(false)}
        variant="standard"
        layer="derived"
        instance="ingredient-supplier-filter"
        usageId="ingredient-supplier-filter"
        usageLabel="Filtrar ingredientes por proveedor"
        title="Proveedor"
        headerTone="petroleum"
        scrollContent
      >
        <div className="space-y-2">
          {allSuppliers.map((supplier) => (
            <button
              key={supplier.id}
              type="button"
              className="flex min-h-12 w-full items-center rounded-xl border border-zinc-200 bg-white px-3 text-left text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={() => {
                setSelectedSupplier(supplier.name)
                setShowSupplierPopup(false)
              }}
            >
              {supplier.name}
            </button>
          ))}
        </div>
      </Modal>
    </>
  )
}
