'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LayoutGrid,
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

    const childKey = product.childName || '__general__'
    const childLabel = product.childName || 'General'
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

function departmentProductCount(dept: MenuDepartment) {
  return dept.children.reduce((n, c) => n + c.products.length, 0)
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
  const [cartExpanded, setCartExpanded] = useState(false)

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
    setCartExpanded(false)
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
        const category = [parent, child].filter(Boolean).join(' · ')
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

  const browseBreadcrumb = (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      <button
        type="button"
        onClick={() => {
          setBrowseParent(null)
          setBrowseChild(null)
        }}
        className={cn(
          'min-h-8 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider',
          !browseParent ? 'bg-[#36606F] text-white' : 'bg-zinc-100 text-zinc-600'
        )}
      >
        Carta
      </button>
      {activeDepartment ? (
        <button
          type="button"
          onClick={() => setBrowseChild(null)}
          className={cn(
            'min-h-8 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider truncate max-w-[9rem]',
            browseChild ? 'bg-zinc-100 text-zinc-600' : 'bg-[#36606F] text-white'
          )}
        >
          {activeDepartment.label}
        </button>
      ) : null}
      {activeChildGroup ? (
        <span className="min-h-8 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#36606F] text-white truncate max-w-[9rem] inline-flex items-center">
          {activeChildGroup.label}
        </span>
      ) : null}
    </div>
  )

  const browsePanel = (() => {
    if (loadingMenu) {
      return (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-[#36606F]" />
        </div>
      )
    }

    if (!browseParent) {
      return (
        <div className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-zinc-50 to-white p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-3 px-1">
            <LayoutGrid className="h-4 w-4 text-[#36606F]" strokeWidth={2.5} />
            <p className="text-[10px] font-black uppercase tracking-widest text-[#36606F]">Departamentos</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {departments.map((dept) => (
              <button
                key={dept.key}
                type="button"
                onClick={() => {
                  setBrowseParent(dept.key)
                  if (dept.children.length === 1) {
                    setBrowseChild(dept.children[0].key)
                  } else {
                    setBrowseChild(null)
                  }
                }}
                className="min-h-[56px] rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left shadow-sm hover:border-[#36606F]/35 hover:shadow-md active:scale-[0.98] transition-all"
              >
                <span className="block text-[12px] font-black text-zinc-900 leading-snug line-clamp-2">
                  {dept.label}
                </span>
                <span className="mt-1 inline-flex rounded-md bg-[#36606F]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#36606F]">
                  {departmentProductCount(dept)} prod.
                </span>
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (!browseChild && activeDepartment) {
      return (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 shadow-sm">
          {browseBreadcrumb}
          <button
            type="button"
            onClick={() => {
              setBrowseParent(null)
              setBrowseChild(null)
            }}
            className="min-h-10 mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-zinc-500"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver
          </button>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 px-1 mb-2">
            Secciones · {activeDepartment.label}
          </p>
          <ul className="flex flex-col gap-2">
            {activeDepartment.children.map((child) => (
              <li key={child.key}>
                <button
                  type="button"
                  onClick={() => setBrowseChild(child.key)}
                  className="min-h-12 w-full rounded-xl border border-white bg-white px-4 py-3 text-left shadow-sm hover:border-[#36606F]/25 flex items-center justify-between gap-3"
                >
                  <span className="text-[13px] font-bold text-zinc-800">{child.label}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-semibold text-zinc-400">{child.products.length}</span>
                    <ChevronRight className="h-4 w-4 text-zinc-400" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )
    }

    if (activeChildGroup) {
      return (
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-3 shadow-sm">
          {browseBreadcrumb}
          <button
            type="button"
            onClick={() => {
              if (activeDepartment && activeDepartment.children.length === 1) {
                setBrowseParent(null)
                setBrowseChild(null)
              } else {
                setBrowseChild(null)
              }
            }}
            className="min-h-10 mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-800/70"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver
          </button>
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800/80 px-1 mb-2">
            Añadir producto
          </p>
          <ul className="flex flex-col gap-1.5">
            {activeChildGroup.products.map((p) => (
              <li key={p.product_id}>
                <button
                  type="button"
                  onClick={() => addProduct(p)}
                  className="min-h-12 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-left flex items-center gap-3 hover:bg-emerald-50/80 active:scale-[0.99] transition-all"
                >
                  <span className="flex-1 min-w-0 text-[13px] font-bold text-zinc-800 truncate">{p.name}</span>
                  <span className="shrink-0 min-h-10 min-w-10 rounded-full bg-[#36606F] text-white flex items-center justify-center shadow-sm">
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

      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        <div className="shrink-0 px-4 py-3 bg-zinc-50 border-b border-zinc-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto…"
              className="min-h-12 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm font-semibold shadow-sm focus:border-[#36606F]/40 focus:outline-none focus:ring-2 focus:ring-[#36606F]/15"
            />
          </div>
        </div>

        <div className="flex-1 px-4 py-3 min-h-0">
          {searchActive ? (
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-900/70 px-1 mb-2">
                Búsqueda
              </p>
              {searchResults.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {searchResults.map((p) => (
                    <li key={p.product_id}>
                      <button
                        type="button"
                        onClick={() => addProduct(p)}
                        className="min-h-12 w-full rounded-xl border border-amber-100 bg-white px-3 py-2 text-left flex items-center gap-3 hover:bg-amber-50"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold text-zinc-800 truncate">{p.name}</span>
                          {p.category ? (
                            <span className="block text-[10px] font-medium text-zinc-500 truncate">{p.category}</span>
                          ) : null}
                        </div>
                        <span className="shrink-0 min-h-10 min-w-10 rounded-full bg-amber-600 text-white flex items-center justify-center">
                          <Plus className="h-4 w-4" strokeWidth={2.5} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-xs font-semibold text-amber-900/60 py-4">Sin resultados.</p>
              )}
            </div>
          ) : (
            browsePanel
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-200 bg-white">
        <button
          type="button"
          onClick={() => setCartExpanded((open) => !open)}
          className="min-h-12 w-full px-4 flex items-center justify-between gap-3 hover:bg-zinc-50"
          aria-expanded={cartExpanded}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="min-h-9 min-w-9 rounded-xl bg-[#36606F]/10 text-[#36606F] flex items-center justify-center shrink-0">
              <ShoppingBag className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <div className="text-left min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Pedido actual</p>
              <p className="text-[13px] font-bold text-zinc-900 truncate">
                {lineCount > 0 ? `${lineCount} líneas · ${unitCount} uds` : 'Vacío'}
              </p>
            </div>
          </div>
          {cartExpanded ? (
            <ChevronUp className="h-5 w-5 text-zinc-400 shrink-0" />
          ) : (
            <ChevronDown className="h-5 w-5 text-zinc-400 shrink-0" />
          )}
        </button>

        {cartExpanded ? (
          <div className="px-4 pb-3 border-t border-zinc-100 bg-zinc-50/80 max-h-[min(40vh,280px)] overflow-y-auto">
            {lines.length === 0 ? (
              <p className="py-6 text-center text-xs font-semibold text-zinc-500">Sin productos aún.</p>
            ) : (
              <div className="overflow-x-auto border border-zinc-200 rounded-xl bg-white mt-3">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50">
                      <th className="px-2 py-2 font-black uppercase text-[9px] text-zinc-500">Producto</th>
                      <th className="px-2 py-2 font-black uppercase text-[9px] text-zinc-500 w-24">Cant.</th>
                      <th className="px-2 py-2 font-black uppercase text-[9px] text-zinc-500">Notas</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {lines.map((line) => (
                      <tr key={line.lineKey}>
                        <td className="px-2 py-2 font-bold text-zinc-800 align-top">{line.name}</td>
                        <td className="px-2 py-2 align-top">
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                updateLine(line.lineKey, { quantity: Math.max(1, line.quantity - 1) })
                              }
                              className="min-h-10 min-w-10 flex items-center justify-center rounded-lg border border-zinc-200 bg-white"
                              aria-label="Menos"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <input
                              inputMode="numeric"
                              value={String(line.quantity)}
                              onChange={(e) => {
                                const n = Math.max(1, Math.min(999, Number(e.target.value) || 1))
                                updateLine(line.lineKey, { quantity: n })
                              }}
                              className="w-10 min-h-10 text-center rounded-lg border border-zinc-200 font-bold bg-white"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateLine(line.lineKey, { quantity: Math.min(999, line.quantity + 1) })
                              }
                              className="min-h-10 min-w-10 flex items-center justify-center rounded-lg border border-zinc-200 bg-white"
                              aria-label="Más"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input
                            value={line.notes}
                            onChange={(e) => updateLine(line.lineKey, { notes: e.target.value })}
                            placeholder="Notas…"
                            className="min-h-10 w-full min-w-[6rem] rounded-lg border border-zinc-200 px-2 text-[11px] font-medium bg-white"
                          />
                        </td>
                        <td className="px-1 py-2 align-top">
                          <button
                            type="button"
                            onClick={() => removeLine(line.lineKey)}
                            className="min-h-10 min-w-10 flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-lg"
                            aria-label="Quitar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>

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
