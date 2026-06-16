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

function newLineKey() {
  return crypto.randomUUID()
}

function modalShellClassName() {
  return cn(
    'bg-white rounded-[2rem] shadow-2xl flex flex-col overflow-hidden',
    'w-full max-w-[min(36rem,calc(100vw-2rem))]',
    'max-h-[calc(100dvh-2rem)]'
  )
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

function BrowseNavBar({
  eyebrow,
  title,
  onBack,
}: {
  eyebrow: string
  title: string
  onBack?: () => void
}) {
  return (
    <div className="flex items-center gap-2 mb-3 min-h-12">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 min-h-12 min-w-12 rounded-xl border border-zinc-200 bg-white shadow-sm flex items-center justify-center text-[#36606F] hover:bg-zinc-50 active:scale-[0.98] transition-all"
          aria-label="Volver"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
        </button>
      ) : (
        <span className="shrink-0 min-h-12 min-w-12" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">{eyebrow}</p>
        <p className="text-[15px] font-black text-zinc-900 truncate leading-tight">{title}</p>
      </div>
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
      <div className={modalShellClassName()} onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#36606F] px-4 py-3 text-white shrink-0 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Pedido actual</p>
            <h3 className="text-base font-black truncate">
              {lineCount > 0 ? `${lineCount} líneas · ${unitCount} uds` : 'Vacío'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10 shrink-0"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
          {lines.length === 0 ? (
            <p className="py-12 text-center text-sm font-semibold text-zinc-500">Sin productos aún.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {lines.map((line) => {
                const note = line.notes.trim()
                return (
                  <div
                    key={line.lineKey}
                    className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-black text-zinc-900 leading-snug">{line.name}</p>
                        {note ? (
                          <p className="mt-1 text-[11px] font-medium text-zinc-500 lowercase">{note}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveLine(line.lineKey)}
                        className="shrink-0 min-h-10 min-w-10 flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-xl"
                        aria-label="Quitar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex items-center gap-1 shrink-0 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateLine(line.lineKey, { quantity: Math.max(1, line.quantity - 1) })
                          }
                          className="min-h-10 min-w-10 flex items-center justify-center rounded-lg bg-white border border-zinc-200"
                          aria-label="Menos"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-10 text-center text-sm font-black tabular-nums">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateLine(line.lineKey, { quantity: Math.min(999, line.quantity + 1) })
                          }
                          className="min-h-10 min-w-10 flex items-center justify-center rounded-lg bg-white border border-zinc-200"
                          aria-label="Más"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input
                        value={line.notes}
                        onChange={(e) => onUpdateLine(line.lineKey, { notes: e.target.value })}
                        placeholder="Notas…"
                        className="min-h-12 flex-1 rounded-xl border border-zinc-200 px-3 text-[12px] font-medium bg-zinc-50"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 w-full rounded-xl bg-[#36606F] text-[11px] font-black uppercase text-white"
          >
            Continuar añadiendo
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
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<EditorLine[]>([])
  const [deleteConfirm, setDeleteConfirm] = useState(false)
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
    setCartModalOpen(false)
  }, [initialItems, eventId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingMenu(true)
      const { data, error } = await supabase
        .from('v_public_menu_items')
        .select(
          'articulo_id, carta_nombre, precio, category_parent_name, category_child_name, sort_order, category_parent_sort_order, category_child_sort_order'
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

      const products: EncargoEditorMenuProduct[] = (data ?? []).map((row) => {
        const parent = String((row as { category_parent_name?: string }).category_parent_name ?? '').trim()
        const child = String((row as { category_child_name?: string }).category_child_name ?? '').trim()
        const displayChild = child ? displaySubcategoryLabel(parent, child) : ''
        const category = [parent, displayChild].filter(Boolean).join(' · ')
        return {
          product_id: eventOrderProductId((row as { articulo_id: number }).articulo_id),
          name: String((row as { carta_nombre?: string }).carta_nombre ?? '').trim(),
          category,
          parentName: parent,
          childName: child,
          parentSort: Number((row as { category_parent_sort_order?: number }).category_parent_sort_order) || 0,
          childSort: Number((row as { category_child_sort_order?: number }).category_child_sort_order) || 0,
          price: Number((row as { precio?: number }).precio) || 0,
        }
      })

      const filtered = products.filter((p) => p.name)
      setMenuProducts(filtered)

      setLines((prev) =>
        prev.map((line) => {
          const found = filtered.find((p) => p.product_id === line.product_id)
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
      .slice(0, 16)
  }, [search, menuProducts])

  const activeDepartment = useMemo(
    () => departments.find((d) => d.key === browseParent) ?? null,
    [departments, browseParent]
  )

  const activeChildGroup = useMemo(
    () => activeDepartment?.children.find((c) => c.key === browseChild) ?? null,
    [activeDepartment, browseChild]
  )

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

  const productsTitle =
    activeChildGroup && activeChildGroup.label.trim()
      ? activeChildGroup.label
      : activeDepartment?.label ?? 'Productos'

  const browsePanel = (() => {
    if (loadingMenu) {
      return (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#36606F]" />
        </div>
      )
    }

    if (!browseParent) {
      return (
        <div className="rounded-[1.35rem] border border-zinc-200/80 bg-gradient-to-b from-white to-zinc-50 p-3 shadow-sm">
          <BrowseNavBar eyebrow="Carta" title="Departamentos" />
          <div className="grid grid-cols-2 gap-2.5">
            {departments.map((dept) => (
              <button
                key={dept.key}
                type="button"
                onClick={() => openDepartment(dept)}
                className="min-h-[58px] rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-center shadow-sm hover:border-[#36606F]/30 hover:shadow-md active:scale-[0.98] transition-all"
              >
                <span className="block text-[12px] font-black text-zinc-900 leading-snug line-clamp-3">
                  {dept.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (!browseChild && activeDepartment && namedChildren(activeDepartment).length > 0) {
      return (
        <div className="rounded-[1.35rem] border border-zinc-200 bg-zinc-50/90 p-3 shadow-sm">
          <BrowseNavBar
            eyebrow="Departamento"
            title={activeDepartment.label}
            onBack={goToDepartments}
          />
          <ul className="flex flex-col gap-2">
            {namedChildren(activeDepartment).map((child) => (
              <li key={child.key}>
                <button
                  type="button"
                  onClick={() => setBrowseChild(child.key)}
                  className="min-h-[52px] w-full rounded-2xl border border-white bg-white px-4 py-3 text-left shadow-sm hover:border-[#36606F]/20 flex items-center justify-between gap-3 active:scale-[0.99] transition-all"
                >
                  <span className="text-[14px] font-black text-zinc-800">{child.label}</span>
                  <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )
    }

    if (activeChildGroup) {
      return (
        <div className="rounded-[1.35rem] border border-[#36606F]/15 bg-[#36606F]/[0.04] p-3 shadow-sm">
          <BrowseNavBar
            eyebrow={activeDepartment?.label ?? 'Productos'}
            title={productsTitle}
            onBack={() => {
              if (activeDepartment && namedChildren(activeDepartment).length > 0) {
                goToSections()
              } else {
                goToDepartments()
              }
            }}
          />
          <ul className="flex flex-col gap-1.5">
            {activeChildGroup.products.map((p) => (
              <li key={p.product_id}>
                <button
                  type="button"
                  onClick={() => addProduct(p)}
                  className="min-h-[52px] w-full rounded-2xl border border-white bg-white px-3 py-2.5 text-left flex items-center gap-3 shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
                >
                  <span className="flex-1 min-w-0 text-[13px] font-bold text-zinc-800 leading-snug">
                    {p.name}
                  </span>
                  <span className="shrink-0 min-h-11 min-w-11 rounded-full bg-[#36606F] text-white flex items-center justify-center shadow-sm">
                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )
    }

    return null
  })()

  const body = (
    <>
      <div className="bg-[#36606F] px-4 py-3 text-white shrink-0 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Editar encargo</p>
          <h3 className="text-base font-black truncate">{eventName}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10 shrink-0"
          aria-label="Cerrar"
        >
          <X size={20} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col bg-zinc-50/60">
        <div className="shrink-0 px-4 py-3 border-b border-zinc-100 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto…"
              className="min-h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 pl-10 pr-3 text-sm font-semibold focus:border-[#36606F]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#36606F]/15"
            />
          </div>
        </div>

        <div className="flex-1 px-4 py-3 min-h-0">
          {searchActive ? (
            <div className="rounded-[1.35rem] border border-amber-200/70 bg-amber-50/40 p-3 shadow-sm">
              <BrowseNavBar eyebrow="Búsqueda" title={`“${search.trim()}”`} onBack={() => setSearch('')} />
              {searchResults.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {searchResults.map((p) => (
                    <li key={p.product_id}>
                      <button
                        type="button"
                        onClick={() => addProduct(p)}
                        className="min-h-[52px] w-full rounded-2xl border border-amber-100/80 bg-white px-3 py-2 text-left flex items-center gap-3 shadow-sm hover:bg-amber-50/60"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold text-zinc-800 truncate">{p.name}</span>
                          {p.category ? (
                            <span className="block text-[10px] font-semibold text-amber-900/50 truncate mt-0.5">
                              {p.category}
                            </span>
                          ) : null}
                        </div>
                        <span className="shrink-0 min-h-11 min-w-11 rounded-full bg-amber-700 text-white flex items-center justify-center">
                          <Plus className="h-4 w-4" strokeWidth={2.5} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-xs font-semibold text-amber-900/60 py-6">Sin resultados.</p>
              )}
            </div>
          ) : (
            browsePanel
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setCartModalOpen(true)}
        className="shrink-0 min-h-[56px] w-full px-4 flex items-center justify-between gap-3 border-t border-zinc-200 bg-white hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="relative min-h-11 min-w-11 rounded-2xl bg-[#36606F] text-white flex items-center justify-center shrink-0 shadow-sm">
            <ShoppingBag className="h-4 w-4" strokeWidth={2.5} />
            {lineCount > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 min-h-[18px] min-w-[18px] px-1 rounded-full bg-amber-500 text-[9px] font-black text-white flex items-center justify-center">
                {lineCount > 9 ? '9+' : lineCount}
              </span>
            ) : null}
          </span>
          <div className="text-left min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Pedido actual</p>
            <p className="text-[14px] font-black text-zinc-900 truncate">
              {lineCount > 0 ? `${lineCount} líneas · ${unitCount} uds` : 'Toca para revisar'}
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-zinc-300 shrink-0" />
      </button>

      <div className="shrink-0 border-t border-zinc-100 px-4 py-3 flex flex-col gap-2 bg-white">
        {deleteConfirm ? (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-bold text-rose-700 text-center">¿Eliminar este encargo?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setDeleteConfirm(false)}
                className="min-h-12 text-[11px] font-black uppercase text-zinc-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleDelete}
                className="min-h-12 text-[11px] font-black uppercase text-rose-600"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setDeleteConfirm(true)}
            className="min-h-12 text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50 rounded-xl"
          >
            Eliminar encargo
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="min-h-12 rounded-xl bg-zinc-100 text-[11px] font-black uppercase text-zinc-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isPending || loadingMenu}
            onClick={handleSave}
            className="min-h-12 rounded-xl bg-[#36606F] text-[11px] font-black uppercase text-white disabled:opacity-50"
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
    return <div className={cn('min-h-screen flex flex-col bg-white mx-auto', modalShellClassName())}>{body}</div>
  }

  return (
    <div
      className="fixed inset-0 z-[10070] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose()
      }}
      role="presentation"
    >
      <div className={modalShellClassName()} onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  )
}
