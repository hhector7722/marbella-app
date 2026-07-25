export type DemoMetric = {
  id: string
  label: string
  value: string
  delta: string
  tone: 'neutral' | 'success' | 'warning' | 'danger'
}

export type DemoTableRow = {
  id: string
  name: string
  category: string
  status: 'ok' | 'pending' | 'alert'
  amount: string
}

export type DemoSideItem = {
  id: string
  title: string
  subtitle: string
}

export const demoPageMeta = {
  title: 'Playground MDS',
  description:
    'Referencia visual del AppShell V2 y del Design System. Solo datos mock.',
} as const

export const demoMetrics: DemoMetric[] = [
  {
    id: 'sales',
    label: 'Ventas hoy',
    value: '4.280 €',
    delta: '+8,2%',
    tone: 'success',
  },
  {
    id: 'tickets',
    label: 'Tickets',
    value: '186',
    delta: '+12',
    tone: 'neutral',
  },
  {
    id: 'labor',
    label: 'Coste laboral',
    value: '31%',
    delta: '−1,4 pts',
    tone: 'success',
  },
  {
    id: 'stock',
    label: 'Alertas stock',
    value: '5',
    delta: '+2',
    tone: 'warning',
  },
]

export const demoTableRows: DemoTableRow[] = [
  {
    id: 'r1',
    name: 'Cerveza rubia 33cl',
    category: 'Bebidas',
    status: 'ok',
    amount: '2,80 €',
  },
  {
    id: 'r2',
    name: 'Tortilla de patatas',
    category: 'Cocina',
    status: 'pending',
    amount: '4,50 €',
  },
  {
    id: 'r3',
    name: 'Aceite AOVE 5L',
    category: 'Stock',
    status: 'alert',
    amount: '38,00 €',
  },
  {
    id: 'r4',
    name: 'Café espresso',
    category: 'Bebidas',
    status: 'ok',
    amount: '1,60 €',
  },
  {
    id: 'r5',
    name: 'Servicio terraza',
    category: 'Extras',
    status: 'pending',
    amount: '0,50 €',
  },
]

export const demoSideItems: DemoSideItem[] = [
  {
    id: 's1',
    title: 'Cierre de caja',
    subtitle: 'Pendiente de revisión',
  },
  {
    id: 's2',
    title: 'Reserva mesa 12',
    subtitle: 'Hoy · 21:00 · 6 pax',
  },
  {
    id: 's3',
    title: 'Pedido proveedor',
    subtitle: 'Llega mañana · 09:30',
  },
]
