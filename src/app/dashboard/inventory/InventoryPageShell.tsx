'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button, PageActions, PageHeader } from '@/components/mds'
import { InventoryClient, type ManagerIngredientRow } from './InventoryClient'

type Props = {
  visibleIngredients: ManagerIngredientRow[]
  managerFullList: ManagerIngredientRow[]
  managerEmptyHint: boolean
}

/**
 * Capa cliente del inventario manager: estado de edición de visibilidad + cabecera MDS.
 * El shell de página lo aporta V2PageShell en page.tsx.
 */
export function InventoryPageShell({
  visibleIngredients,
  managerFullList,
  managerEmptyHint,
}: Props) {
  const [visibilityEditMode, setVisibilityEditMode] = useState(false)

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Conteo y ajuste de stock por ingrediente."
        actions={
          <PageActions>
            <Button
              type="button"
              variant="icon"
              onClick={() => setVisibilityEditMode((v) => !v)}
              aria-label={
                visibilityEditMode
                  ? 'Salir de edición de lista'
                  : 'Editar lista de inventario'
              }
              title={
                visibilityEditMode
                  ? 'Cerrar edición de lista'
                  : 'Editar lista de inventario'
              }
              aria-pressed={visibilityEditMode}
              className={
                visibilityEditMode
                  ? 'bg-mds-primary/10 text-mds-primary'
                  : undefined
              }
            >
              <Pencil className="size-6" strokeWidth={2} aria-hidden />
            </Button>
          </PageActions>
        }
      />
      <InventoryClient
        initialIngredients={visibleIngredients}
        managerFullList={managerFullList}
        visibilityEditMode={visibilityEditMode}
        onCloseVisibilityEditMode={() => setVisibilityEditMode(false)}
        managerEmptyHint={managerEmptyHint}
      />
    </>
  )
}
