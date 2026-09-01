'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InventoryClient, type ManagerIngredientRow } from './InventoryClient'

type Props = {
  visibleIngredients: ManagerIngredientRow[]
  managerFullList: ManagerIngredientRow[]
  managerEmptyHint: boolean
}

export function InventoryPageShell({ visibleIngredients, managerFullList, managerEmptyHint }: Props) {
  const [visibilityEditMode, setVisibilityEditMode] = useState(false)

  return (
    <InventoryClient
      initialIngredients={visibleIngredients}
      managerFullList={managerFullList}
      visibilityEditMode={visibilityEditMode}
      onCloseVisibilityEditMode={() => setVisibilityEditMode(false)}
      managerEmptyHint={managerEmptyHint}
      rightSlot={
        <Button
          type="button"
          variant="tertiary"
          instance="inventory-visibility-edit"
          icon={<Pencil strokeWidth={2} />}
          aria-label={visibilityEditMode ? 'Salir de edición de lista' : 'Editar lista de inventario'}
          onClick={() => setVisibilityEditMode((v) => !v)}
        />
      }
    />
  )
}
