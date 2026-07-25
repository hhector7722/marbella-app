import {
  Activity,
  CalendarDays,
  LayoutDashboard,
  Package,
  PartyPopper,
  Settings,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import type { NavigationGroup } from '../sidebar/navigation'

/** Mock navigation for AppShell playground. Visual only — no real routing. */
export const demoNavigation: NavigationGroup[] = [
  {
    id: 'main',
    label: 'Principal',
    sections: [
      {
        id: 'ops',
        items: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            href: '/dev/app-shell',
            icon: LayoutDashboard,
            isActive: true,
            shortcut: '⌘D',
          },
          {
            id: 'ventas',
            label: 'Ventas',
            href: '/dev/app-shell#ventas',
            icon: TrendingUp,
            badge: 3,
          },
          {
            id: 'personal',
            label: 'Personal',
            href: '/dev/app-shell#personal',
            icon: Users,
          },
          {
            id: 'caja',
            label: 'Caja',
            href: '/dev/app-shell#caja',
            icon: Wallet,
          },
          {
            id: 'stock',
            label: 'Stock',
            href: '/dev/app-shell#stock',
            icon: Package,
            badge: '!',
          },
        ],
      },
    ],
  },
  {
    id: 'ops-extra',
    label: 'Operación',
    sections: [
      {
        id: 'hospitality',
        items: [
          {
            id: 'reservas',
            label: 'Reservas',
            href: '/dev/app-shell#reservas',
            icon: CalendarDays,
            badge: 12,
          },
          {
            id: 'eventos',
            label: 'Eventos',
            href: '/dev/app-shell#eventos',
            icon: PartyPopper,
          },
          {
            id: 'actividad',
            label: 'Actividad',
            href: '/dev/app-shell#actividad',
            icon: Activity,
          },
        ],
      },
    ],
  },
  {
    id: 'system',
    sections: [
      {
        id: 'settings',
        label: 'Sistema',
        items: [
          {
            id: 'config',
            label: 'Configuración',
            href: '/dev/app-shell#config',
            icon: Settings,
          },
        ],
      },
    ],
  },
]
