'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  createStaffEventOrderAction,
  deleteEncargoStaffAction,
  updateStaffEventOrderAction,
} from '@/app/dashboard/eventos/actions'
import { eventOrderProductId } from '@/lib/event-order-carta'
import type { StaffEncargoLineItem } from '@/lib/encargo-staff-helpers'
import { cn } from '@/lib/utils'
import { createClient } from '@/utils/supabase/client'

export type EncargoEditorMenuProduct = {
  product_id: string
  name: string
  category: string
  parentName: string
  childName: string
  parentSort: number
  childSort: number
  price: number
  isCartaActive: boolean
}

type EditorLine = StaffEncargoLineItem & {
  lineKey: string
  name: string
}

type MenuChildGroup = {
  key: string
  label: string
  sortOrder: number
  products: EncargoEditorMenuProduct[]
}

type MenuDepartment = {
  key: string
  label: string
  sortOrder: number
  children: MenuChildGroup[]
}

const DIRECT_CHILD_KEY = '__direct__'

const EDITOR_MODAL_CLASS = cn(
  'bg-white rounded-[2rem] shadow-2xl flex flex-col overflow-hidden',
  'w-[min(36rem,calc(100vw-2rem))]',
  'h-[min(40rem,calc(100dvh-2rem))]'
)

const CART_MODAL_CLASS = cn(
  'bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden',
  'w-[min(26rem,calc(100vw-3rem))]',
  'h-[min(28rem,calc(100dvh-4rem))]'
)

function newLineKey() {
  return crypto.randomUUID()
}

function displaySubcategoryLabel(parentName: string, childName: string): string {
  const child = childName.trim()
  const parent = parentName.trim()
  if (!child) return ''
  const prefixes = parent
    ? [`${parent} - `, `${parent} · `, `${parent} – `].map((p) => p.toLowerCase())
    : []
  const lowerChild = child.toLowerCase()
  for (const prefix of prefixes) {
    if (lowerChild.startsWith(prefix)) {
      return child.slice(prefix.length).trim()
    }
  }
  if (parent && lowerChild === parent.toLowerCase()) return ''
  return child
}

function buildDepartments(products: EncargoEditorMenuProduct[]): MenuDepartment[] {
  const byParent = new Map<string, MenuDepartment>()

  for (const product of products) {
    const parentKey = product.parentName || 'Otros'
    const parentLabel = product.parentName || 'Otros'
    let dept = byParent.get(parentKey)
    if (!dept) {
      dept = {
        key: parentKey,
        label: parentLabel,
        sortOrder: product.parentSort,
        children: [],
      }
      byParent.set(parentKey, dept)
    }

    const rawChild = product.childName.trim()
    const childKey = rawChild ? rawChild : DIRECT_CHILD_KEY
    const childLabel = rawChild ? displaySubcategoryLabel(parentLabel, rawChild) : ''
    let child = dept.children.find((c) => c.key === childKey)
    if (!child) {
      child = {
        key: childKey,
        label: childLabel,
        sortOrder: product.childSort,
        products: [],
      }
      dept.children.push(child)
    }
    child.products.push(product)
  }

  return [...byParent.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'es'))
    .map((dept) => ({
      ...dept,
      children: dept.children
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'es'))
        .map((child) => ({
          ...child,
          products: child.products.sort((a, b) => a.name.localeCompare(b.name, 'es')),
        })),
    }))
}

function namedChildren(dept: MenuDepartment): MenuChildGroup[] {
  return dept.children.filter((c) => c.key !== DIRECT_CHILD_KEY && c.label.trim())
}

function resolveDepartmentEntry(dept: MenuDepartment): { parent: string; child: string | null } {
  const named = namedChildren(dept)
  if (named.length === 1) {
    return { parent: dept.key, child: named[0].key }
  }
  if (named.length === 0) {
    const direct = dept.children.find((c) => c.key === DIRECT_CHILD_KEY) ?? dept.children[0]
    return { parent: dept.key, child: direct?.key ?? null }
  }
  return { parent: dept.key, child: null }
}

function buildQtyByProductId(lines: EditorLine[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const line of lines) {
    if (line.quantity <= 0) continue
    map.set(line.product_id, (map.get(line.product_id) ?? 0) + line.quantity)
  }
  return map
}

function childKeyForProduct(product: EncargoEditorMenuProduct): string {
  const rawChild = product.childName.trim()
  return rawChild ? rawChild : DIRECT_CHILD_KEY
}

function productMatchesChildGroup(
  product: EncargoEditorMenuProduct,
  dept: MenuDepartment,
  child: MenuChildGroup
): boolean {
  const parentKey = product.parentName || 'Otros'
  if (parentKey !== dept.key) return false
  return childKeyForProduct(product) === child.key
}

function mapEncargoMenuRow(row: Record<string, unknown>): EncargoEditorMenuProduct | null {
  const name = String(row.carta_nombre ?? '').trim()
  if (!name) return null

  const parent = String(row.category_parent_name ?? '').trim()
  const child = String(row.category_child_name ?? '').trim()
  const displayChild = child ? displaySubcategoryLabel(parent, child) : ''
  const category = [parent, displayChild].filter(Boolean).join(' · ')

  return {
    product_id: eventOrderProductId(row.articulo_id as number),
    name,
    category,
    parentName: parent,
    childName: child,
    parentSort: Number(row.category_parent_sort_order) || 0,
    childSort: Number(row.category_child_sort_order) || 0,
    price: Number(row.precio) || 0,
    isCartaActive: row.is_carta_active !== false,
  }
}

function BrowseNavBar({
  eyebrow,
  title,
  onBack,
}: {
  eyebrow?: string
  title?: string
  onBack?: () => void
}) {
  const hasEyebrow = Boolean(eyebrow?.trim())
  const hasTitle = Boolean(title?.trim())
  if (!onBack && !hasEyebrow && !hasTitle) return null

  return (
    <div className="flex items-center gap-2 mb-2 min-h-10 shrink-0">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 min-h-12 min-w-12 flex items-center justify-center text-[#36606F] hover:text-[#2d505b] active:opacity-70"
          aria-label="Volver"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>
      ) : (
        <span className="shrink-0 min-h-12 min-w-12" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        {hasEyebrow ? (
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-400">{eyebrow}</p>
        ) : null}
        {hasTitle ? (
          <p className="text-[13px] font-black text-zinc-900 truncate leading-tight">{title}</p>
        ) : null}
      </div>
    </div>
  )
}

function clampEncargoQty(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(999, Math.floor(n)))
}

function EncargoQtyStepper({
  quantity,
  onQuantityChange,
  onDecrement,
  onIncrement,
}: {
  quantity: number
  onQuantityChange: (qty: number) => void
  onDecrement: () => void
  onIncrement: () => void
}) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  const displayValue = editing ? draft : quantity > 0 ? String(quantity) : ''

  return (
    <div
      className={cn(
        'flex h-8 w-full items-stretch justify-between overflow-hidden rounded-lg border bg-white shadow-sm',
        quantity > 0 ? 'border-[#36606F]/30 shadow-md' : 'border-zinc-200'
      )}
    >
      <button
        type="button"
        onClick={quantity > 0 ? onDecrement : undefined}
        disabled={quantity <= 0}
        className={cn(
          'flex h-8 w-7 shrink-0 items-center justify-center transition-colors',
          quantity > 0
            ? 'text-zinc-500 hover:bg-rose-50 hover:text-rose-600 active:bg-rose-100'
            : 'text-zinc-300'
        )}
        aria-label="Quitar uno"
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={3} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={quantity > 0 || editing ? displayValue : ' '}
        onFocus={() => {
          setEditing(true)
          setDraft(quantity > 0 ? String(quantity) : '')
        }}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 3)
          setDraft(v)
          if (v === '') return
          onQuantityChange(clampEncargoQty(parseInt(v, 10)))
        }}
        onBlur={() => {
          setEditing(false)
          if (draft === '0') onQuantityChange(0)
          setDraft('')
        }}
        className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-center text-[11px] font-black tabular-nums text-zinc-800 focus:outline-none focus:ring-0"
        aria-label="Cantidad"
      />
      <button
        type="button"
        onClick={onIncrement}
        className="flex h-8 w-7 shrink-0 items-center justify-center text-zinc-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600 active:bg-emerald-100"
        aria-label="Añadir uno"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={3} />
      </button>
    </div>
  )
}

function ProductPickTile({
  product,
  cartQty,
  onAdd,
  onDecrement,
  onSetQuantity,
  showCategory,
}: {
  product: EncargoEditorMenuProduct
  cartQty: number
  onAdd: () => void
  onDecrement: () => void
  onSetQuantity: (qty: number) => void
  showCategory?: boolean
}) {
  return (
    <div className="flex w-full flex-col items-center gap-1">
      <span className="block w-full text-center text-[10px] font-black leading-snug text-zinc-800 line-clamp-2 min-h-[2.4em]">
        {product.name}
      </span>
      {showCategory && product.category ? (
        <span className="block w-full truncate text-center text-[8px] font-semibold text-zinc-400">
          {product.category}
        </span>
      ) : null}

      <EncargoQtyStepper
        quantity={cartQty}
        onQuantityChange={onSetQuantity}
        onDecrement={onDecrement}
        onIncrement={onAdd}
      />
    </div>
  )
}

function ProductPickGrid({
  products,
  qtyByProductId,
  onAdd,
  onDecrement,
  onSetQuantity,
  showCategory,
}: {
  products: EncargoEditorMenuProduct[]
  qtyByProductId: Map<string, number>
  onAdd: (product: EncargoEditorMenuProduct) => void
  onDecrement: (productId: string) => void
  onSetQuantity: (productId: string, qty: number) => void
  showCategory?: boolean
}) {
  return (
    <div className="grid grid-cols-3 gap-x-1.5 gap-y-3 sm:grid-cols-4">
      {products.map((p) => (
        <ProductPickTile
          key={p.product_id}
          product={p}
          cartQty={qtyByProductId.get(p.product_id) ?? 0}
          onAdd={() => onAdd(p)}
          onDecrement={() => onDecrement(p.product_id)}
          onSetQuantity={(qty) => onSetQuantity(p.product_id, qty)}
          showCategory={showCategory}
        />
      ))}
    </div>
  )
}

function EncargoCartModal({
  lines,
  lineCount,
  unitCount,
  onClose,
  onUpdateLine,
  onRemoveLine,
}: {
  lines: EditorLine[]
  lineCount: number
  unitCount: number
  onClose: () => void
  onUpdateLine: (lineKey: string, patch: Partial<StaffEncargoLineItem>) => void
  onRemoveLine: (lineKey: string) => void
}) {
  const content = (
    <div
      className="fixed inset-0 z-[10080] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div className={CART_MODAL_CLASS} onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#36606F] px-3 py-2 text-white shrink-0 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/80">Pedido actual</p>
            <h3 className="text-sm font-black truncate">
              {lineCount > 0 ? `${lineCount} líneas · ${unitCount} uds` : 'Vacío'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 min-w-10 flex items-center justify-center rounded-lg hover:bg-white/10 shrink-0"
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-2 py-1.5">
          {lines.length === 0 ? (
            <p className="py-8 text-center text-xs font-semibold text-zinc-500">Sin productos aún.</p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {lines.map((line) => {
                const note = line.notes.trim()
                return (
                  <div key={line.lineKey} className="py-1.5 px-1 flex items-center gap-1.5 min-h-10">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-zinc-900 truncate leading-tight">{line.name}</p>
                      {note ? (
                        <p className="text-[9px] font-medium text-zinc-500 lowercase truncate">{note}</p>
                      ) : null}
                    </div>
                    <div className="w-[5.5rem] shrink-0">
                      <EncargoQtyStepper
                        quantity={line.quantity}
                        onQuantityChange={(qty) => {
                          if (qty <= 0) onRemoveLine(line.lineKey)
                          else onUpdateLine(line.lineKey, { quantity: qty })
                        }}
                        onDecrement={() => {
                          if (line.quantity <= 1) onRemoveLine(line.lineKey)
                          else onUpdateLine(line.lineKey, { quantity: line.quantity - 1 })
                        }}
                        onIncrement={() =>
                          onUpdateLine(line.lineKey, { quantity: Math.min(999, line.quantity + 1) })
                        }
                      />
                    </div>
                    <input
                      value={line.notes}
                      onChange={(e) => onUpdateLine(line.lineKey, { notes: e.target.value })}
                      placeholder="Notas"
                      className="w-16 min-h-8 rounded border border-zinc-200 px-1.5 text-[10px] font-medium bg-zinc-50 shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveLine(line.lineKey)}
                      className="shrink-0 min-h-8 min-w-8 flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded"
                      aria-label="Quitar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-100 px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 w-full rounded-lg bg-[#36606F] text-[10px] font-black uppercase text-white"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}

export function EncargoProductEditor({
  eventId,
  eventName,
  orderId,
  initialItems,
  onClose,
  onSaved,
  onDeleted,
  asModal = true,
}: {
  eventId: string
  eventName: string
  orderId?: string | null
  initialItems: StaffEncargoLineItem[]
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
  asModal?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [isPending, startTransition] = useTransition()
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [menuProducts, setMenuProducts] = useState<EncargoEditorMenuProduct[]>([])
  const [inactiveMenuProducts, setInactiveMenuProducts] = useState<EncargoEditorMenuProduct[]>([])
  const [showInactiveInView, setShowInactiveInView] = useState(false)
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<EditorLine[]>([])
  const [browseParent, setBrowseParent] = useState<string | null>(null)
  const [browseChild, setBrowseChild] = useState<string | null>(null)
  const [cartModalOpen, setCartModalOpen] = useState(false)

  useEffect(() => {
    const seed: EditorLine[] = initialItems.map((it) => ({
      ...it,
      lineKey: newLineKey(),
      name: it.name?.trim() || it.product_id,
    }))
    setLines(seed)
    setBrowseParent(null)
    setBrowseChild(null)
    setSearch('')
    setShowInactiveInView(false)
    setCartModalOpen(false)
  }, [initialItems, eventId])

  useEffect(() => {
    setShowInactiveInView(false)
  }, [browseParent, browseChild])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingMenu(true)
      const { data, error } = await supabase
        .from('v_staff_encargo_menu_items')
        .select(
          'articulo_id, carta_nombre, precio, category_parent_name, category_child_name, sort_order, category_parent_sort_order, category_child_sort_order, is_carta_active'
        )
        .order('category_parent_sort_order', { ascending: true, nullsFirst: false })
        .order('category_child_sort_order', { ascending: true, nullsFirst: false })
        .order('sort_order', { ascending: true, nullsFirst: false })

      if (cancelled) return
      if (error) {
        toast.error(error.message)
        setLoadingMenu(false)
        return
      }

      const active: EncargoEditorMenuProduct[] = []
      const inactive: EncargoEditorMenuProduct[] = []
      const allById = new Map<string, EncargoEditorMenuProduct>()

      for (const row of data ?? []) {
        const product = mapEncargoMenuRow(row as Record<string, unknown>)
        if (!product) continue
        allById.set(product.product_id, product)
        if (product.isCartaActive) active.push(product)
        else inactive.push(product)
      }

      setMenuProducts(active)
      setInactiveMenuProducts(inactive)

      setLines((prev) =>
        prev.map((line) => {
          const found = allById.get(line.product_id)
          return found ? { ...line, name: found.name } : line
        })
      )
      setLoadingMenu(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const departments = useMemo(() => buildDepartments(menuProducts), [menuProducts])
  const qtyByProductId = useMemo(() => buildQtyByProductId(lines), [lines])
  const productById = useMemo(() => {
    const map = new Map<string, EncargoEditorMenuProduct>()
    for (const product of [...menuProducts, ...inactiveMenuProducts]) {
      map.set(product.product_id, product)
    }
    return map
  }, [menuProducts, inactiveMenuProducts])

  const searchActive = search.trim().length >= 2

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return menuProducts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.product_id.includes(q)
      )
      .slice(0, 24)
  }, [search, menuProducts])

  const activeDepartment = useMemo(
    () => departments.find((d) => d.key === browseParent) ?? null,
    [departments, browseParent]
  )

  const activeChildGroup = useMemo(
    () => activeDepartment?.children.find((c) => c.key === browseChild) ?? null,
    [activeDepartment, browseChild]
  )

  const inactiveInCurrentView = useMemo(() => {
    if (!activeDepartment || !activeChildGroup) return []
    return inactiveMenuProducts
      .filter((product) => productMatchesChildGroup(product, activeDepartment, activeChildGroup))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [inactiveMenuProducts, activeDepartment, activeChildGroup])

  const productsInCurrentView = useMemo(() => {
    if (!activeChildGroup) return []
    const active = activeChildGroup.products
    if (!showInactiveInView) return active
    return [...active, ...inactiveInCurrentView].sort((a, b) =>
      a.name.localeCompare(b.name, 'es')
    )
  }, [activeChildGroup, inactiveInCurrentView, showInactiveInView])

  const lineCount = lines.length
  const unitCount = useMemo(
    () => lines.reduce((sum, line) => sum + (line.quantity > 0 ? line.quantity : 0), 0),
    [lines]
  )

  const addProduct = useCallback((product: EncargoEditorMenuProduct) => {
    setLines((prev) => {
      const mergeTarget = prev.find((l) => l.product_id === product.product_id && !l.notes.trim())
      if (mergeTarget) {
        return prev.map((l) =>
          l.lineKey === mergeTarget.lineKey ? { ...l, quantity: Math.min(999, l.quantity + 1) } : l
        )
      }
      return [
        ...prev,
        {
          lineKey: newLineKey(),
          product_id: product.product_id,
          name: product.name,
          quantity: 1,
          notes: '',
        },
      ]
    })
    setSearch('')
  }, [])

  const decrementProduct = useCallback((productId: string) => {
    setLines((prev) => {
      const mergeTarget = prev.find((l) => l.product_id === productId && !l.notes.trim())
      if (mergeTarget) {
        if (mergeTarget.quantity > 1) {
          return prev.map((l) =>
            l.lineKey === mergeTarget.lineKey ? { ...l, quantity: l.quantity - 1 } : l
          )
        }
        return prev.filter((l) => l.lineKey !== mergeTarget.lineKey)
      }
      const productLines = prev.filter((l) => l.product_id === productId)
      if (productLines.length === 0) return prev
      const last = productLines[productLines.length - 1]
      if (last.quantity > 1) {
        return prev.map((l) => (l.lineKey === last.lineKey ? { ...l, quantity: l.quantity - 1 } : l))
      }
      return prev.filter((l) => l.lineKey !== last.lineKey)
    })
  }, [])

  const setProductQuantity = useCallback(
    (productId: string, rawQty: number) => {
      const quantity = clampEncargoQty(rawQty)
      setLines((prev) => {
        const mergeTarget = prev.find((l) => l.product_id === productId && !l.notes.trim())
        if (quantity === 0) {
          if (mergeTarget) return prev.filter((l) => l.lineKey !== mergeTarget.lineKey)
          return prev.filter((l) => !(l.product_id === productId && !l.notes.trim()))
        }
        if (mergeTarget) {
          return prev.map((l) =>
            l.lineKey === mergeTarget.lineKey ? { ...l, quantity } : l
          )
        }
        const product = productById.get(productId)
        if (!product) return prev
        return [
          ...prev,
          {
            lineKey: newLineKey(),
            product_id: productId,
            name: product.name,
            quantity,
            notes: '',
          },
        ]
      })
      setSearch('')
    },
    [productById]
  )

  const updateLine = useCallback((lineKey: string, patch: Partial<StaffEncargoLineItem>) => {
    setLines((prev) =>
      prev.map((l) => (l.lineKey === lineKey ? { ...l, ...patch, name: l.name } : l))
    )
  }, [])

  const removeLine = useCallback((lineKey: string) => {
    setLines((prev) => prev.filter((l) => l.lineKey !== lineKey))
  }, [])

  const goToDepartments = useCallback(() => {
    setBrowseParent(null)
    setBrowseChild(null)
  }, [])

  const goToSections = useCallback(() => {
    if (!activeDepartment) return
    setBrowseChild(null)
  }, [activeDepartment])

  const openDepartment = useCallback((dept: MenuDepartment) => {
    const next = resolveDepartmentEntry(dept)
    setBrowseParent(next.parent)
    setBrowseChild(next.child)
  }, [])

  const handleSave = useCallback(() => {
    const payload = lines
      .filter((l) => l.quantity > 0)
      .map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        notes: l.notes.trim() || null,
      }))

    if (payload.length === 0) {
      toast.error('Añade al menos un producto.')
      return
    }

    startTransition(async () => {
      const res = orderId
        ? await updateStaffEventOrderAction({ orderId, items: payload })
        : await createStaffEventOrderAction({
            eventId,
            items: payload,
            responsible_name: eventName,
          })

      if (!res.success) {
        toast.error(res.message)
        return
      }
      toast.success('Pedido guardado')
      onSaved()
    })
  }, [lines, orderId, eventId, eventName, onSaved])

  const handleDelete = useCallback(() => {
    startTransition(async () => {
      const res = await deleteEncargoStaffAction({ eventId })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      toast.success('Encargo eliminado')
      onDeleted?.()
      onClose()
    })
  }, [eventId, onClose, onDeleted])

  const handleDeleteRequest = useCallback(() => {
    if (!window.confirm('¿Eliminar este encargo? Esta acción no se puede deshacer.')) return
    handleDelete()
  }, [handleDelete])

  const subcategoryTitle =
    activeChildGroup && activeChildGroup.label.trim()
      ? activeChildGroup.label
      : activeDepartment?.label ?? 'Productos'

  const browsePanel = (() => {
    if (loadingMenu) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#36606F]" />
        </div>
      )
    }

    if (!browseParent) {
      return (
        <div className="h-full flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              {departments.map((dept) => (
                <button
                  key={dept.key}
                  type="button"
                  onClick={() => openDepartment(dept)}
                  className="min-h-[48px] rounded-xl border border-zinc-200 bg-white px-2 py-2 text-center hover:border-[#36606F]/30 active:scale-[0.98] transition-all"
                >
                  <span className="block text-[11px] font-black text-zinc-900 leading-snug line-clamp-3">
                    {dept.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )
    }

    if (!browseChild && activeDepartment && namedChildren(activeDepartment).length > 0) {
      return (
        <div className="h-full flex flex-col min-h-0">
          <BrowseNavBar title={activeDepartment.label} onBack={goToDepartments} />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ul className="flex flex-col gap-1.5">
              {namedChildren(activeDepartment).map((child) => (
                <li key={child.key}>
                  <button
                    type="button"
                    onClick={() => setBrowseChild(child.key)}
                    className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left flex items-center justify-between gap-2 hover:border-[#36606F]/20"
                  >
                    <span className="text-[12px] font-black text-zinc-800">{child.label}</span>
                    <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )
    }

    if (activeChildGroup) {
      const showDeptAboveSub =
        activeDepartment &&
        namedChildren(activeDepartment).length > 0 &&
        activeChildGroup.label.trim().length > 0

      return (
        <div className="h-full flex flex-col min-h-0">
          <BrowseNavBar
            eyebrow={showDeptAboveSub ? activeDepartment.label : undefined}
            title={subcategoryTitle}
            onBack={() => {
              if (activeDepartment && namedChildren(activeDepartment).length > 0) {
                goToSections()
              } else {
                goToDepartments()
              }
            }}
          />
          <div className="flex-1 min-h-0 overflow-y-auto">
            {inactiveInCurrentView.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowInactiveInView((v) => !v)}
                className="mb-2 min-h-12 w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 text-[10px] font-black uppercase tracking-wider text-zinc-600 hover:border-[#36606F]/30 hover:text-[#36606F] active:opacity-80"
              >
                {showInactiveInView
                  ? 'Ocultar no activos'
                  : `Mostrar no activos (${inactiveInCurrentView.length})`}
              </button>
            ) : null}
            <ProductPickGrid
              products={productsInCurrentView}
              qtyByProductId={qtyByProductId}
              onAdd={addProduct}
              onDecrement={decrementProduct}
              onSetQuantity={setProductQuantity}
            />
          </div>
        </div>
      )
    }

    return null
  })()

  const body = (
    <>
      <div className="bg-[#36606F] px-4 py-2.5 text-white shrink-0 flex items-center gap-0.5">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/80">Editar encargo</p>
          <h3 className="text-sm font-black truncate">{eventName}</h3>
        </div>
        <button
          type="button"
          onClick={() => setCartModalOpen(true)}
          className="relative shrink-0 min-h-12 min-w-12 flex items-center justify-center text-white active:opacity-70"
          aria-label={unitCount > 0 ? `Pedido actual, ${unitCount} unidades` : 'Pedido actual'}
        >
          <ShoppingBag size={20} strokeWidth={2.25} />
          {unitCount > 0 ? (
            <span className="absolute top-1.5 right-1.5 min-h-[16px] min-w-[16px] px-0.5 rounded-full bg-rose-500 text-[9px] font-black text-white flex items-center justify-center leading-none">
              {unitCount > 99 ? '99+' : unitCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={handleDeleteRequest}
          disabled={isPending}
          className="shrink-0 min-h-12 min-w-12 flex items-center justify-center text-white active:opacity-70 disabled:opacity-40"
          aria-label="Eliminar encargo"
        >
          <Trash2 size={20} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="shrink-0 min-h-12 min-w-12 flex items-center justify-center text-white active:opacity-70 disabled:opacity-40"
          aria-label="Cerrar"
        >
          <X size={20} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-white overflow-hidden">
        <div className="shrink-0 px-3 py-2 border-b border-zinc-100 bg-white">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto…"
              className="min-h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm font-semibold focus:border-[#36606F]/40 focus:outline-none focus:ring-2 focus:ring-[#36606F]/15"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 px-3 py-2 overflow-hidden bg-white">
          {searchActive ? (
            <div className="h-full flex flex-col min-h-0">
              <BrowseNavBar eyebrow="Búsqueda" title={`“${search.trim()}”`} onBack={() => setSearch('')} />
              <div className="flex-1 min-h-0 overflow-y-auto">
                {searchResults.length > 0 ? (
                  <ProductPickGrid
                    products={searchResults}
                    qtyByProductId={qtyByProductId}
                    onAdd={addProduct}
                    onDecrement={decrementProduct}
                    onSetQuantity={setProductQuantity}
                    showCategory
                  />
                ) : (
                  <p className="text-center text-xs font-semibold text-zinc-500 py-6">Sin resultados.</p>
                )}
              </div>
            </div>
          ) : (
            browsePanel
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-100 px-3 py-2 bg-white">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="min-h-10 rounded-lg bg-zinc-100 text-[10px] font-black uppercase text-zinc-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isPending || loadingMenu}
            onClick={handleSave}
            className="min-h-10 rounded-lg bg-[#36606F] text-[10px] font-black uppercase text-white disabled:opacity-50"
          >
            {isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Guardar'}
          </button>
        </div>
      </div>

      {cartModalOpen ? (
        <EncargoCartModal
          lines={lines}
          lineCount={lineCount}
          unitCount={unitCount}
          onClose={() => setCartModalOpen(false)}
          onUpdateLine={updateLine}
          onRemoveLine={removeLine}
        />
      ) : null}
    </>
  )

  if (!asModal) {
    return <div className={cn('min-h-screen flex flex-col bg-white mx-auto', EDITOR_MODAL_CLASS)}>{body}</div>
  }

  return (
    <div
      className="fixed inset-0 z-[10070] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose()
      }}
      role="presentation"
    >
      <div className={EDITOR_MODAL_CLASS} onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  )
}
