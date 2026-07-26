import { LayoutDashboard, Settings2 } from 'lucide-react'
import type { NavigationGroup } from '@/components/layout-v2'
import { managerNavigation } from './manager'

/**
 * Navegación AppShell V2 — admin.
 * Extiende herramientas manager + entradas admin futuras.
 */
export const adminNavigation: NavigationGroup[] = [
  ...managerNavigation,
  {
    id: 'admin-tools',
    label: 'Admin',
    sections: [
      {
        id: 'admin-ops',
        items: [
          {
            id: 'admin-import',
            label: 'Import',
            href: '/admin/import',
            icon: LayoutDashboard,
          },
          {
            id: 'admin-mapeo',
            label: 'Mapeo',
            href: '/admin/mapeo',
            icon: Settings2,
          },
        ],
      },
    ],
  },
]
