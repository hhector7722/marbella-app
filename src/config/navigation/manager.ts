import {
  Activity,
  Globe,
  LayoutDashboard,
  Package,
  ScanLine,
  Smartphone,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import type { NavigationGroup } from '@/components/layout-v2'

/**
 * Navegación AppShell V2 — variante manager / master tools.
 * Fuente de verdad; sin isActive (lo resuelve el registry).
 */
export const managerNavigation: NavigationGroup[] = [
  {
    id: 'manager-tools',
    label: 'Herramientas',
    sections: [
      {
        id: 'adoption',
        items: [
          {
            id: 'master',
            label: 'Master',
            href: '/master/dashboard',
            icon: LayoutDashboard,
          },
          {
            id: 'uso',
            label: 'Uso app',
            href: '/dashboard/uso',
            icon: Activity,
          },
          {
            id: 'instalacion-app',
            label: 'Instalación app',
            href: '/dashboard/instalacion-app',
            icon: Smartphone,
          },
          {
            id: 'web',
            label: 'Web',
            href: '/dashboard/web',
            icon: Globe,
          },
          {
            id: 'insights',
            label: 'Insights',
            href: '/dashboard/insights',
            icon: TrendingUp,
          },
          {
            id: 'scanner',
            label: 'Escáner',
            href: '/dashboard/scanner',
            icon: ScanLine,
          },
        ],
      },
      {
        id: 'inventory',
        label: 'Inventario',
        items: [
          {
            id: 'inventory-waste',
            label: 'Mermas',
            href: '/dashboard/inventory/waste',
            icon: Trash2,
          },
          {
            id: 'inventory-ledger',
            label: 'Stock',
            href: '/dashboard/inventory/ledger',
            icon: Package,
          },
        ],
      },
    ],
  },
]
