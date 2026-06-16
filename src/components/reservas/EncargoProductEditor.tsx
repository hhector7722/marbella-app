'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { ChevronLeft, Loader2, Minus, Plus, Search, Trash2, X } from 'lucide-react'
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

  useEffect(() => {
    const seed: EditorLine[] = initialItems.map((it) => ({
      ...it,
      lineKey: newLineKey(),
      name: it.product_id,
    }))
    setLines(seed)
    setBrowseParent(null)
    setBrowseChild(null)
    setSearch('')
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

  const browsePanel = (() => {
    if (loadingMenu) return null

    if (!browseParent) {
      return (
        <ul className="rounded-xl border border-zinc-100 divide-y divide-zinc-100 overflow-hidden">
          {departments.map((dept) => (
            <li key={dept.key}>
              <button
                type="button"
                onClick={() => {
                  setBrowseParent(dept.key)
                  if (dept.children.length === 1) {
                    setBrowseChild(dept.children[0].key)
                  } else {
                    setBrowseChild(null)
                  }
                }}
                className="min-h-12 w-full px-4 py-3 text-left hover:bg-zinc-50 flex items-center justify-between gap-2"
              >
                <span className="text-[13px] font-bold text-zinc-800">{dept.label}</span>
                <span className="text-[10px] font-semibold text-zinc-400">
                  {dept.children.reduce((n, c) => n + c.products.length, 0)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )
    }

    if (!browseChild && activeDepartment) {
      return (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setBrowseParent(null)
              setBrowseChild(null)
            }}
            className="min-h-12 flex items-center gap-2 text-[11px] font-black uppercase text-[#36606F] px-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Departamentos
          </button>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">
            {activeDepartment.label}
          </p>
          <ul className="rounded-xl border border-zinc-100 divide-y divide-zinc-100 overflow-hidden">
            {activeDepartment.children.map((child) => (
              <li key={child.key}>
                <button
                  type="button"
                  onClick={() => setBrowseChild(child.key)}
                  className="min-h-12 w-full px-4 py-3 text-left hover:bg-zinc-50 flex items-center justify-between gap-2"
                >
                  <span className="text-[13px] font-bold text-zinc-800">{child.label}</span>
                  <span className="text-[10px] font-semibold text-zinc-400">{child.products.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )
    }

    if (activeChildGroup) {
      return (
        <div className="flex flex-col gap-2">
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
            className="min-h-12 flex items-center gap-2 text-[11px] font-black uppercase text-[#36606F] px-1"
          >
            <ChevronLeft className="h-4 w-4" />
            {activeDepartment?.label ?? 'Volver'}
          </button>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">
            {activeChildGroup.label}
          </p>
          <ul className="rounded-xl border border-zinc-100 divide-y divide-zinc-100 overflow-hidden">
            {activeChildGroup.products.map((p) => (
              <li key={p.product_id}>
                <button
                  type="button"
                  onClick={() => addProduct(p)}
                  className="min-h-12 w-full px-4 py-2.5 text-left hover:bg-zinc-50"
                >
                  <span className="block text-[13px] font-bold text-zinc-800">{p.name}</span>
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

      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto…"
            className="min-h-12 w-full rounded-xl border border-zinc-200 pl-10 pr-3 text-sm font-semibold"
          />
        </div>

        {searchActive && searchResults.length > 0 ? (
          <ul className="rounded-xl border border-zinc-100 divide-y divide-zinc-100 overflow-hidden">
            {searchResults.map((p) => (
              <li key={p.product_id}>
                <button
                  type="button"
                  onClick={() => addProduct(p)}
                  className="min-h-12 w-full px-3 py-2 text-left hover:bg-zinc-50"
                >
                  <span className="block text-[13px] font-bold text-zinc-800 truncate">{p.name}</span>
                  {p.category ? (
                    <span className="block text-[10px] font-medium text-zinc-500 truncate">{p.category}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : searchActive ? (
          <p className="text-center text-xs font-semibold text-zinc-500 py-2">Sin resultados.</p>
        ) : (
          browsePanel
        )}

        {loadingMenu ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[#36606F]" />
          </div>
        ) : lines.length === 0 ? (
          <p className="py-4 text-center text-xs font-semibold text-zinc-500">
            Elige un departamento o busca productos para añadirlos.
          </p>
        ) : (
          <div className="overflow-x-auto border border-zinc-100 rounded-xl">
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
                          className="min-h-10 min-w-10 flex items-center justify-center rounded-lg border border-zinc-200"
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
                          className="w-10 min-h-10 text-center rounded-lg border border-zinc-200 font-bold"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateLine(line.lineKey, { quantity: Math.min(999, line.quantity + 1) })
                          }
                          className="min-h-10 min-w-10 flex items-center justify-center rounded-lg border border-zinc-200"
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
                        className="min-h-10 w-full min-w-[6rem] rounded-lg border border-zinc-200 px-2 text-[11px] font-medium"
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

      <div className="shrink-0 border-t border-zinc-100 px-4 py-3 flex flex-col gap-2">
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
