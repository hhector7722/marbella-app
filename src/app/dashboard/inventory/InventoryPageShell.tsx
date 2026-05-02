'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { InventoryClient, type ManagerIngredientRow } from './InventoryClient'

type Props = {
  visibleIngredients: ManagerIngredientRow[]
  managerFullList: ManagerIngredientRow[]
  managerEmptyHint: boolean
}

export function InventoryPageShell({ visibleIngredients, managerFullList, managerEmptyHint }: Props) {
  const [visibilityEditMode, setVisibilityEditMode] = useState(false)

  return (
    <DashboardDetailLayout
      title="Inventario"
      maxWidthClass="max-w-7xl"
      className="pt-6 md:pt-8"
      rightSlot={
        <button
          type="button"
          onClick={() => setVisibilityEditMode((v) => !v)}
          className={cn(
            'min-h-[48px] min-w-[48px] flex items-center justify-center transition-colors shrink-0',
            visibilityEditMode ? 'text-white' : 'text-white/90 hover:text-white',
          )}
          aria-label={visibilityEditMode ? 'Salir de edición de lista' : 'Editar lista de inventario'}
          title={visibilityEditMode ? 'Cerrar edición de lista' : 'Editar lista de inventario'}
        >
          <Pencil className="w-6 h-6" strokeWidth={2} />
        </button>
      }
    >
      <InventoryClient
        initialIngredients={visibleIngredients}
        managerFullList={managerFullList}
        visibilityEditMode={visibilityEditMode}
        onCloseVisibilityEditMode={() => setVisibilityEditMode(false)}
        managerEmptyHint={managerEmptyHint}
      />
    </DashboardDetailLayout>
  )
}
