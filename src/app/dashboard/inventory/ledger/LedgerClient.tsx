'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Scale,
  Receipt,
  ShoppingCart,
  Loader2,
  Package,
  ChevronDown,
  Filter,
  BookOpen,
} from 'lucide-react'
import {
  getIngredientMovements,
  getInventoryCountSessions,
  type InventoryCountSession,
} from './actions'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchField } from '@/components/ui/SearchField'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { CatalogTileUnificado } from '@/components/catalog/CatalogTile'
import { formatMadridHmFromIso } from '@/lib/madrid-date-bounds'
import Link from 'next/link'

type Ingredient = {
  id: string
  name: string
  unit: string
  stock_current: number | null
  category: string
  image_url: string | null
  order_unit: string | null
  has_inventory_count: boolean
  stock_tracked: boolean
}

type Movement = {
  id: string
  movement_type: string
  quantity: number
  unit: string
  movement_date: string
  reference_doc: string | null
  original_description: string | null
  processed_by: string | null
}

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: LucideIcon; color: string; bg: string }
> = {
  PURCHASE: {
    label: 'Entrada',
    icon: ShoppingCart,
    color: 'text-green-700',
    bg: 'bg-green-50',
  },
  SALE: {
    label: 'Venta TPV',
    icon: Receipt,
    color: 'text-red-700',
    bg: 'bg-red-50',
  },
  WASTE: {
    label: 'Merma',
    icon: AlertTriangle,
    color: 'text-orange-700',
    bg: 'bg-orange-50',
  },
  INVENTORY_COUNT: {
    label: 'Arqueo',
    icon: Scale,
    color: 'text-purple-700',
    bg: 'bg-purple-50',
  },
  ADJUSTMENT: {
    label: 'Ajuste',
    icon: Scale,
    color: 'text-zinc-700',
    bg: 'bg-zinc-50',
  },
}

function movementRowStyle(mov: Movement): {
  label: string
  icon: LucideIcon
  color: string
  bg: string
} {
  const qty = Number(mov.quantity)
  const base = TYPE_CONFIG[mov.movement_type] ?? TYPE_CONFIG.ADJUSTMENT

  if (mov.movement_type === 'INVENTORY_COUNT') {
    if (qty >= 0) {
      return {
        label: 'Arqueo (entrada)',
        icon: base.icon,
        color: 'text-green-700',
        bg: 'bg-green-50',
      }
    }
    return {
      label: 'Arqueo (salida)',
      icon: base.icon,
      color: 'text-orange-700',
      bg: 'bg-orange-50',
    }
  }

  if (mov.movement_type === 'ADJUSTMENT') {
    if (qty >= 0) {
      return {
        ...base,
        label: 'Ajuste (entrada)',
        color: 'text-green-700',
        bg: 'bg-green-50',
      }
    }
    return {
      ...base,
      label: 'Ajuste (salida)',
      color: 'text-red-700',
      bg: 'bg-red-50',
    }
  }

  return base
}

function isOutflow(type: string, qty: number): boolean {
  if (type === 'SALE' || type === 'WASTE') return true
  if (type === 'INVENTORY_COUNT' && qty < 0) return true
  if (type === 'ADJUSTMENT' && qty < 0) return true
  return false
}

function formatQuantity(qty: number, type: string) {
  const n = Number(qty)
  const negative = isOutflow(type, n)
  const sign = negative ? '-' : '+'
  const val = Math.abs(n).toFixed(2)
  const colorClass = negative ? 'text-rose-300' : 'text-emerald-300'
  return (
    <span className={cn('font-bold', colorClass)}>
      {sign}
      {val}
    </span>
  )
}

function ReadOnlyStockBox({
  stock,
  unit,
  className,
}: {
  stock: number | null
  unit: string
  className?: string
}) {
  const waiting = stock === null || !Number.isFinite(stock)
  const n = waiting ? 0 : Number(stock)
  const empty = !waiting && (n === 0 || Object.is(n, -0))
  return (
    <div
      className={cn(
        'flex items-stretch justify-between min-w-0',
        'bg-white/10 border border-white/15 rounded-xl overflow-hidden min-h-[48px]',
        className,
      )}
    >
      <div className="flex-1 flex items-center justify-center px-2 min-w-0">
        <span className="text-center font-black tabular-nums text-sm text-white">
          {waiting ? 'Pendiente' : empty ? '0' : String(n)}
        </span>
      </div>
      <span className="pr-3 flex items-center text-[10px] font-black text-white/65 uppercase tracking-wide shrink-0 border-l border-white/10">
        {unit}
      </span>
    </div>
  )
}

function localDateParts(iso: string): { year: number; month: number; day: number } | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
}

function formatCountDate(iso: string): string {
  const parts = localDateParts(iso)
  if (!parts) return ''
  const date = new Date(parts.year, parts.month, parts.day)
  return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatCountTime(iso: string): string {
  return formatMadridHmFromIso(iso) ?? ''
}

function formatCountQuantity(value: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value)
}

function displayReference(ref: string | null) {
  const t = ref?.trim()
  if (!t) return <span className="text-xs text-white/45">&nbsp;</span>
  return (
    <p className="text-xs text-white/55 font-mono mt-1 break-all" title={t}>
      {t}
    </p>
  )
}


type UnitImpact = { unit: string; quantity: number }
type SaleTicketGroup = {
  key: string
  reference: string | null
  at: string
  impacts: UnitImpact[]
}
type LedgerDisplayRow =
  | { kind: 'movement'; key: string; at: string; movement: Movement }
  | {
      kind: 'sale-day'
      key: string
      at: string
      date: string
      impacts: UnitImpact[]
      tickets: SaleTicketGroup[]
    }

const madridDayFormat = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function saleImpacts(rows: Movement[]): UnitImpact[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const unit = row.unit || ''
    const quantity = Math.abs(Number(row.quantity))
    if (!Number.isFinite(quantity)) continue
    totals.set(unit, (totals.get(unit) || 0) + quantity)
  }
  return Array.from(totals, ([unit, quantity]) => ({ unit, quantity }))
}

function movementHistoryRows(movements: Movement[]): LedgerDisplayRow[] {
  const salesByDay = new Map<string, Movement[]>()
  const rows: LedgerDisplayRow[] = []

  for (const movement of movements) {
    if (movement.movement_type !== 'SALE') {
      rows.push({ kind: 'movement', key: movement.id, at: movement.movement_date, movement })
      continue
    }
    // Fecha de actividad local: un ticket a las 00:15 pertenece al día de Barcelona.
    const day = madridDayFormat.format(new Date(movement.movement_date))
    const bucket = salesByDay.get(day) || []
    bucket.push(movement)
    salesByDay.set(day, bucket)
  }

  for (const [date, sales] of salesByDay) {
    const ticketsByReference = new Map<string, Movement[]>()
    for (const sale of sales) {
      // Solo fusionamos movimientos con la MISMA referencia de ticket.
      // Un movimiento sin referencia conserva su propia identidad.
      const key = sale.reference_doc?.trim() || sale.id
      const bucket = ticketsByReference.get(key) || []
      bucket.push(sale)
      ticketsByReference.set(key, bucket)
    }

    const tickets = Array.from(ticketsByReference, ([key, ticketRows]) => ({
      key,
      reference: ticketRows[0].reference_doc?.trim() || null,
      at: ticketRows.reduce(
        (latest, ticketRow) =>
          ticketRow.movement_date > latest ? ticketRow.movement_date : latest,
        ticketRows[0].movement_date,
      ),
      impacts: saleImpacts(ticketRows),
    })).sort((a, b) => b.at.localeCompare(a.at))

    rows.push({
      kind: 'sale-day',
      key: 'sales-' + date,
      date,
      at: tickets[0].at,
      impacts: saleImpacts(sales),
      tickets,
    })
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at))
}

function SaleImpact({ impacts }: { impacts: UnitImpact[] }) {
  return (
    <span className="flex flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0.5 tabular-nums text-rose-300">
      {impacts.map((impact) => (
        <span key={impact.unit} className="whitespace-nowrap font-bold">
          {'−' + formatCountQuantity(impact.quantity)}
          <span className="ml-1 text-xs font-medium text-white/55">{impact.unit}</span>
        </span>
      ))}
    </span>
  )
}

function LedgerIngredientCard({
  item,
  selected,
  onSelect,
}: {
  item: Ingredient
  selected: boolean
  onSelect: () => void
}) {
  return (
    <CatalogTileUnificado
      title={item.name}
      imageSrc={item.image_url}
      fallback={<Package className="h-8 w-8 md:h-10 md:w-10" />}
      valueLabel={item.stock_current === null
        ? 'Pendiente'
        : item.stock_current === 0
          ? ''
          : `${formatCountQuantity(item.stock_current)} ${item.unit}`}
      selected={selected}
      onClick={onSelect}
    />
  )
}

export function LedgerClient({ ingredients }: { ingredients: Ingredient[] }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedIng, setSelectedIng] = useState<Ingredient | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [movementError, setMovementError] = useState<string | null>(null)
  const [expandedSaleDay, setExpandedSaleDay] = useState<string | null>(null)
  const movementRequestId = useRef(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<InventoryCountSession[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)

  useEffect(() => {
    if (!filterOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-ledger-filter-root="true"]')) return
      setFilterOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [filterOpen])

  // Siempre exactamente los productos activos en Inventario.
  // Los recuentos anteriores no determinan si se muestra un producto.
  const visibleIngredients = ingredients

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const i of visibleIngredients) {
      const c = (i.category ?? '').trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [visibleIngredients])

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = visibleIngredients.filter((i) => {
      const okText = !q || i.name.toLowerCase().includes(q)
      const okCat = !category || i.category === category
      return okText && okCat
    })
    return list.reduce(
      (acc, curr) => {
        ;(acc[curr.category] = acc[curr.category] || []).push(curr)
        return acc
      },
      {} as Record<string, Ingredient[]>,
    )
  }, [visibleIngredients, search, category])

  const movementRows = useMemo(() => movementHistoryRows(movements), [movements])

  const handleSelect = async (ing: Ingredient) => {
    const requestId = ++movementRequestId.current
    setSelectedIng(ing)
    setMovements([])
    setExpandedSaleDay(null)
    setMovementError(null)
    setIsLoading(true)
    try {
      const data = await getIngredientMovements(ing.id)
      if (movementRequestId.current !== requestId) return
      setMovements((data as Movement[]) || [])
    } catch (error) {
      if (movementRequestId.current !== requestId) return
      console.error(error)
      setMovementError(error instanceof Error ? error.message : 'No se pudieron cargar los movimientos.')
    } finally {
      if (movementRequestId.current === requestId) setIsLoading(false)
    }
  }

  const handleCloseMovements = () => {
    ++movementRequestId.current
    setSelectedIng(null)
    setMovements([])
    setExpandedSaleDay(null)
    setMovementError(null)
    setIsLoading(false)
  }

  const handleOpenHistory = async () => {
    setHistoryOpen(true)
    setIsLoadingHistory(true)
    setHistoryError(null)
    try {
      const data = await getInventoryCountSessions()
      setHistory(data)
    } catch (error) {
      console.error(error)
      setHistoryError(error instanceof Error ? error.message : 'No se pudo cargar el historial')
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const handleCloseHistory = () => {
    setHistoryOpen(false)
    setExpandedSessionId(null)
  }

  return (
    <DashboardDetailLayout
      title="Stock"
      subtitle="Productos activos en Inventario · stock desde el nuevo recuento"
      maxWidthClass="max-w-7xl"
      showBackButton={false}
      rightSlot={
        <Link
          href="/dashboard/recetas-tpv"
          className="shrink-0 text-[11px] font-black uppercase tracking-widest hover:opacity-80 transition-colors min-h-[48px] flex items-center"
        >
          Mapeo TPV
        </Link>
      }
      toolbarSlot={
        <div className="flex items-center gap-2 w-full relative">
          <div className="w-full flex-1 min-w-0">
            <SearchField
              instance="inventory-ledger-search"
              placeholder="Buscar ingrediente…"
              value={search}
              onChange={setSearch}
            />
          </div>
          <div className="shrink-0 relative" data-ledger-filter-root="true">
            <button
              type="button"
              data-design-exception="native-business-button:stock-filter-icon"
              aria-label="Filtrar productos"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((v) => !v)}
              className="flex min-h-12 min-w-12 items-center justify-center border-0 bg-transparent text-ds-texto-invertido"
            >
              <Filter className="h-6 w-6" strokeWidth={1.75} />
            </button>
            {filterOpen ? (
              <div
                className="absolute right-0 mt-2 w-64 rounded-2xl bg-white text-zinc-900 shadow-2xl border border-zinc-100 overflow-hidden z-20"
                data-ledger-filter-root="true"
              >
                <button
                  type="button"
                  onClick={() => {
                    setCategory(null)
                    setFilterOpen(false)
                  }}
                  className={cn(
                    'w-full min-h-12 px-4 py-3 flex items-center justify-between hover:bg-zinc-50 active:bg-zinc-100 transition-colors',
                    !category && 'bg-zinc-50',
                  )}
                >
                  <span className="text-[11px] font-black uppercase tracking-widest">Todas</span>
                  <span className="text-[10px] font-black text-zinc-400">{visibleIngredients.length}</span>
                </button>
                <div className="h-px bg-zinc-100" />
                <div className="max-h-72 overflow-auto">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCategory(c)
                        setFilterOpen(false)
                      }}
                      className={cn(
                        'w-full min-h-12 px-4 py-3 text-left hover:bg-zinc-50 active:bg-zinc-100 transition-colors',
                        category === c && 'bg-zinc-50',
                      )}
                    >
                      <span className="text-[11px] font-black uppercase tracking-widest text-zinc-700">{c}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            data-design-exception="native-business-button:stock-history-icon"
            aria-label="Abrir historial de recuentos"
            onClick={() => void handleOpenHistory()}
            className="flex min-h-12 min-w-12 items-center justify-center border-0 bg-transparent text-ds-texto-invertido"
          >
            <BookOpen className="h-6 w-6" strokeWidth={1.75} />
          </button>
        </div>
      }
    >
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <div className="w-full flex flex-col gap-3 min-h-0">
        <div className="flex-1 min-h-[min(480px,55vh)] max-h-[min(640px,70vh)] overflow-y-auto pr-0.5">
          {Object.keys(grouped).length === 0 ? (
            <EmptyState
              instance="inventory-ledger-mismatch"
              variant="mismatch"
              title="No hay productos activos que coincidan."
            />
          ) : (
            <div className="flex flex-col gap-6">
              {Object.entries(grouped).map(([cat, items]) => (
                <section key={cat} className="flex flex-col gap-3">
                  <div className="text-sm font-black uppercase tracking-wide text-ds-texto-invertido px-0.5">{cat}</div>
                  <div className="grid grid-cols-4 items-start gap-5 sm:gap-6 md:gap-8 lg:gap-4 xl:gap-5">
                    {items.map((ing) => (
                      <LedgerIngredientCard
                        key={ing.id}
                        item={ing}
                        selected={selectedIng?.id === ing.id}
                        onSelect={() => handleSelect(ing)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>

    <Modal
      open={selectedIng !== null}
      onClose={handleCloseMovements}
      variant="standard"
      layer="base"
      scheme="dark"
      instance="inventory-ledger-product-movements"
      usageId="inventory-ledger-product-movements"
      usageLabel="Movimientos de stock por producto"
      title={selectedIng?.name ?? 'Movimientos de stock'}
      subtitle="Historial de movimientos"
    >
      <div className="w-full min-w-0 rounded-xl border border-white/10 bg-white/5 flex flex-col">
        {!selectedIng ? (
          <div className="flex-1 flex items-center justify-center text-white/55 font-medium px-6 py-16 text-center text-sm">
            Selecciona un ingrediente para ver sus movimientos
          </div>
        ) : (
          <>
            <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center gap-4 justify-between bg-white/5 shrink-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="shrink-0 h-14 w-14 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
                  {selectedIng.image_url ? (
                    <img src={selectedIng.image_url} alt="" className="h-12 w-12 object-contain" />
                  ) : (
                    <Package className="w-8 h-8 text-white/30" strokeWidth={1.5} />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-white truncate" title={selectedIng.name}>
                    {selectedIng.name}
                  </h2>
                  <p className="text-xs font-bold uppercase tracking-wide text-white/60 mt-0.5 truncate">
                    {selectedIng.category}
                  </p>
                </div>
              </div>
              <div className="shrink-0 w-full sm:w-auto sm:max-w-[220px]">
                <p className="text-[10px] font-black uppercase tracking-wider text-white/60 mb-1 sm:text-right">
                  Stock desde inventario
                </p>
                <ReadOnlyStockBox
                  stock={selectedIng.stock_current}
                  unit={selectedIng.unit}
                  className="w-full sm:ml-auto sm:max-w-[200px]"
                />
              </div>
            </div>

            <div className="p-0 overflow-y-auto flex-1 min-h-[200px]">
              {isLoading ? (
                <div className="flex justify-center p-10">
                  <Loader2 className="w-8 h-8 animate-spin text-white/55" />
                </div>
              ) : movementError ? (
                <div role="alert" className="p-10 text-center text-sm text-rose-200">{movementError}</div>
              ) : movements.length === 0 ? (
                <div className="p-10 text-center text-white/60">{selectedIng.has_inventory_count
                  ? "No hay movimientos posteriores al inventario inicial."
                  : "Pendiente de inventario inicial. Aún no hay movimientos de Stock 2.0."}</div>
              ) : (
                <div className="divide-y divide-white/10" data-instance="inventory-ledger-movements">
                  {movementRows.map((row) => {
                    if (row.kind === 'sale-day') {
                      const expanded = expandedSaleDay === row.key
                      return (
                        <div key={row.key}>
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-label={'Ventas del ' + row.date + '. Ver desglose por ticket'}
                            onClick={() => setExpandedSaleDay(expanded ? null : row.key)}
                            className="flex w-full min-h-16 items-center gap-3 p-3 sm:p-4 text-left transition-colors hover:bg-white/10 active:bg-white/10"
                          >
                            <Receipt className="h-5 w-5 shrink-0 text-white/70" strokeWidth={1.75} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-white">Ventas · {row.date}</span>
                              <span className="mt-0.5 block text-xs text-white/55">
                                {row.tickets.length} {row.tickets.length === 1 ? 'ticket' : 'tickets'}
                              </span>
                            </span>
                            <SaleImpact impacts={row.impacts} />
                            <ChevronDown
                              className={cn('h-4 w-4 shrink-0 text-white/60 transition-transform', expanded && 'rotate-180')}
                              strokeWidth={2}
                            />
                          </button>
                          {expanded ? (
                            <div className="border-t border-white/10 bg-black/10 px-3 pb-2 pt-1 sm:px-4">
                              {row.tickets.map((ticket) => (
                                <div key={ticket.key} className="flex items-start justify-between gap-3 border-b border-white/10 py-3 last:border-b-0">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-white/90 break-all">
                                      {ticket.reference
                                        ? 'Ticket ' + ticket.reference.replace(/^TICKET-/i, '')
                                        : 'Venta sin número de ticket'}
                                    </p>
                                    <p className="mt-0.5 text-xs tabular-nums text-white/55">
                                      {formatMadridHmFromIso(ticket.at)}
                                    </p>
                                  </div>
                                  <SaleImpact impacts={ticket.impacts} />
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    }

                    const movement = row.movement
                    const conf = movementRowStyle(movement)
                    const Icon = conf.icon
                    return (
                      <div key={row.key} className="flex items-start justify-between gap-3 p-3 sm:p-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white/90">
                            {new Date(movement.movement_date).toLocaleString('es-ES', {
                              timeZone: 'Europe/Madrid',
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-white/75">
                            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                            {conf.label}
                          </p>
                          {displayReference(movement.reference_doc)}
                          {movement.original_description ? (
                            <p className="mt-1 text-xs text-white/50 break-words">{movement.original_description}</p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-right text-sm tabular-nums">
                          {formatQuantity(movement.quantity, movement.movement_type)}
                          <span className="ml-1 text-xs text-white/55">{movement.unit}</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

    </Modal>
    <Modal
      open={historyOpen}
      onClose={handleCloseHistory}
      variant="standard"
      layer="base"
      scheme="work"
      headerTone="white"
      headerTitleAlign="left"
      instance="inventory-count-history"
      usageId="inventory-count-history"
      usageLabel="Historial de recuentos"
      title="Historial de recuentos"
      subtitle="Lo contado en cada inventario"
    >
      {isLoadingHistory ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      ) : historyError ? (
        <EmptyState
          instance="inventory-count-history-error"
          variant="error"
          title="No se pudo cargar el historial."
          description={historyError}
        />
      ) : history.length === 0 ? (
        <EmptyState
          instance="inventory-count-history-none"
          variant="none"
          title="Todavía no hay recuentos guardados."
          description="Cuando guardes un recuento desde Inventario aparecerá aquí."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {history.map((session) => {
            const expanded = expandedSessionId === session.id
            const time = formatCountTime(session.counted_at)
            return (
              <div
                key={session.id}
                className={cn(
                  'bg-white border border-zinc-100 shadow-sm overflow-hidden',
                  expanded ? 'rounded-none border-0 bg-transparent shadow-none overflow-visible' : 'rounded-full',
                )}
              >
                <button
                  type="button"
                  onClick={() => setExpandedSessionId(expanded ? null : session.id)}
                  aria-expanded={expanded}
                  className={cn(
                    'w-full min-h-[48px] px-5 py-3 flex items-center gap-3 text-left transition-colors',
                    'hover:bg-zinc-50 active:bg-zinc-100',
                    expanded && 'bg-transparent',
                  )}
                >
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-sm font-bold text-zinc-900 first-letter:uppercase truncate">
                      {formatCountDate(session.counted_at)}
                    </span>
                    {time ? (
                      <span className="text-[11px] font-medium text-zinc-400">{time}</span>
                    ) : null}
                  </span>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 shrink-0 text-zinc-400 transition-transform',
                      expanded && 'rotate-180',
                    )}
                    strokeWidth={2.5}
                  />
                </button>

                {expanded ? (
                  <div className="px-3 pb-3 pt-1">
                    <ul className="flex flex-col divide-y divide-zinc-50">
                      {session.lines.map((line) => (
                        <li
                          key={line.ingredient_id}
                          className="flex items-center justify-between gap-3 min-h-[44px] py-1.5 px-2"
                        >
                          <span className="min-w-0 text-sm text-zinc-800 truncate" title={line.name}>
                            {line.name}
                          </span>
                          <span className="shrink-0 flex items-baseline gap-1 tabular-nums">
                            <span className="text-sm font-bold text-zinc-900">
                              {formatCountQuantity(line.physical_stock)}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
                              {line.unit}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
    </DashboardDetailLayout>
  )
}
