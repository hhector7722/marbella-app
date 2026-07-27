import {
  Activity,
  ArrowRightLeft,
  Banknote,
  BookOpen,
  CalendarDays,
  Camera,
  ClipboardList,
  Clock,
  FileText,
  FileUp,
  Globe,
  History,
  Home,
  LayoutDashboard,
  Package,
  Radio,
  ScanLine,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Timer,
  Trash2,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
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
            id: 'inicio',
            label: 'Inicio',
            href: '/dashboard',
            icon: Home,
          },
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
            id: 'inventory',
            label: 'Inventario',
            href: '/dashboard/inventory',
            icon: ClipboardList,
          },
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
      {
        id: 'compras-carta',
        label: 'Compras y carta',
        items: [
          {
            id: 'albaranes',
            label: 'Albaranes',
            href: '/dashboard/albaranes',
            icon: FileText,
          },
          {
            id: 'albaranes-precios',
            label: 'Precios albarán',
            href: '/dashboard/albaranes-precios',
            icon: Camera,
          },
          {
            id: 'carta',
            label: 'Carta',
            href: '/dashboard/carta',
            icon: UtensilsCrossed,
          },
          {
            id: 'recetas-tpv',
            label: 'Mapeo TPV',
            href: '/dashboard/recetas-tpv',
            icon: ArrowRightLeft,
          },
        ],
      },
      {
        id: 'caja',
        label: 'Caja',
        items: [
          {
            id: 'propinas',
            label: 'Propinas',
            href: '/dashboard/propinas',
            icon: Wallet,
          },
          {
            id: 'movements',
            label: 'Movimientos',
            href: '/dashboard/movements',
            icon: Banknote,
          },
          {
            id: 'ledger',
            label: 'Libro mayor',
            href: '/dashboard/ledger',
            icon: BookOpen,
          },
        ],
      },
      {
        id: 'imports',
        label: 'Imports',
        items: [
          {
            id: 'import',
            label: 'Migración legacy',
            href: '/dashboard/import',
            icon: FileUp,
          },
          {
            id: 'recetas-import',
            label: 'Recetas IA',
            href: '/dashboard/recetas-import',
            icon: Sparkles,
          },
        ],
      },
      {
        id: 'sala-ventas',
        label: 'Sala y ventas',
        items: [
          {
            id: 'sala',
            label: 'Sala',
            href: '/dashboard/sala',
            icon: Radio,
          },
          {
            id: 'ventas',
            label: 'Ventas',
            href: '/dashboard/ventas',
            icon: TrendingUp,
          },
        ],
      },
      {
        id: 'personal',
        label: 'Personal',
        items: [
          {
            id: 'consumo-personal',
            label: 'Consumo staff',
            href: '/dashboard/consumo-personal',
            icon: Users,
          },
          {
            id: 'labor',
            label: 'Coste laboral',
            href: '/dashboard/labor',
            icon: Clock,
          },
          {
            id: 'overtime',
            label: 'Horas extras',
            href: '/dashboard/overtime',
            icon: Timer,
          },
          {
            id: 'history',
            label: 'Historial',
            href: '/dashboard/history',
            icon: History,
          },
        ],
      },
      {
        id: 'eventos',
        label: 'Eventos',
        items: [
          {
            id: 'eventos',
            label: 'Encargos',
            href: '/dashboard/eventos',
            icon: CalendarDays,
          },
          {
            id: 'eventos-pedidos',
            label: 'Pedidos',
            href: '/dashboard/eventos/pedidos',
            icon: ShoppingBag,
          },
        ],
      },
    ],
  },
]
