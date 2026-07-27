import {
  Activity,
  CalendarDays,
  ClipboardList,
  Coins,
  LayoutDashboard,
  Utensils,
} from 'lucide-react'
import type { NavigationGroup } from '@/components/layout-v2'

/**
 * Navegación AppShell V2 — variante staff.
 * Ampliar al migrar pantallas; fuente de verdad sin isActive (lo resuelve shared).
 */
export const staffNavigation: NavigationGroup[] = [
  {
    id: 'staff-main',
    label: 'Staff',
    sections: [
      {
        id: 'daily',
        items: [
          {
            id: 'staff-dashboard',
            label: 'Inicio',
            href: '/staff/dashboard',
            icon: LayoutDashboard,
          },
          {
            id: 'staff-history',
            label: 'Asistencia',
            href: '/staff/history',
            icon: ClipboardList,
          },
          {
            id: 'staff-reservas',
            label: 'Reservas',
            href: '/staff/reservas',
            icon: CalendarDays,
          },
          {
            id: 'staff-carta',
            label: 'Carta',
            href: '/staff/carta',
            icon: Utensils,
          },
          {
            id: 'staff-propinas',
            label: 'Propinas',
            href: '/staff/propinas',
            icon: Coins,
          },
          {
            id: 'staff-actividades',
            label: 'Actividades',
            href: '/staff/actividades',
            icon: Activity,
          },
        ],
      },
    ],
  },
]
