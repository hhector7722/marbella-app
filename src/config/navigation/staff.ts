import { CalendarDays, LayoutDashboard, Utensils } from 'lucide-react'
import type { NavigationGroup } from '@/components/layout-v2'

/**
 * Navegación AppShell V2 — variante staff.
 * Placeholder mínimo hasta migrar pantallas staff.
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
        ],
      },
    ],
  },
]
