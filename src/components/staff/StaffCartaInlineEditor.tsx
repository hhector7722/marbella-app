'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { DEFAULT_CARTA_LANG, type CartaLang } from '@/lib/carta-menu-i18n'
import { setMenuCategorySortOrders, upsertMenuOverride } from '@/app/dashboard/carta/actions'
import { MenuAccordion, type DigitalMenuRow } from '@/components/staff/MenuAccordion'
import { MenuCategoryEditModal } from '@/components/carta/MenuCategoryEditModal'
import { MenuItemEditModal } from '@/components/carta/MenuItemEditModal'

type CategoryRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order: number | null
  cover_articulo_id: number | null
}

type OverrideRow = {
  articulo_id: number
  is_hidden: boolean
  category_id: string | null
  sort_order: number | null
  override_nombre: string | null
  override_nombre_es: string | null
  override_nombre_ca: string | null
  override_nombre_en: string | null
  override_descripcion: string | null
  override_precio: number | string | null
  override_photo_url: string | null
}

type MapRow = {
  articulo_id: number
  recipe_id: string
  factor_porcion?: number | string | null
  recipes: {
    id: string
    name: string
    photo_url: string | null
    sale_price: number | string | null
    presentation: string | null
    elaboration: string | null
  } | null
  bdp_articulos: {
    id: number
    nombre: string
    precio_base: number | string | null
    departamento_id: number | null
  } | null
}

function ntrim(s: string | null | undefined): string | null {
  const t = s?.trim()
  return t ? t : null
}

function buildDescripcion(o: OverrideRow | null, r: MapRow['recipes']): string | null {
  const a = ntrim(o?.override_descripcion)
  const b = ntrim(r?.presentation ?? null)
  const c = ntrim(r?.elaboration ?? null)
  const pick = a ?? b ?? c
  return pick
}

export function StaffCartaInlineEditor({
  canEdit,
  lang = DEFAULT_CARTA_LANG,
  onLangChange,
}: {
  canEdit: boolean
  lang?: CartaLang
  onLangChange?: (next: CartaLang) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()
  const [savingArticuloId, setSavingArticuloId] = useState<number | null>(null)

  const [digitalRows, setDigitalRows] = useState<DigitalMenuRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [itemsForCover, setItemsForCover] = useState<Array<{ articulo_id: number; articulo_nombre: string }>>([])

  const [categoryModalId, setCategoryModalId] = useState<string | null>(null)
  const [itemModalArticuloId, setItemModalArticuloId] = useState<number | null>(null)

  const categoryById = useMemo(() => {
    const m = new Map<string, CategoryRow>()
    for (const c of categories) m.set(c.id, c)
    return m
  }, [categories])

  const categoryForModal = useMemo(() => {
    if (!categoryModalId) return null
    const c = categoryById.get(categoryModalId) ?? null
    if (!c) return null
    return {
      id: c.id,
      name: c.name,
      parent_id: c.parent_id,
      cover_articulo_id: c.cover_articulo_id ?? null,
    }
  }, [categoryModalId, categoryById])

  async function load(opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false
    if (!silent) setLoading(true)
    try {
      const [mapRes, overridesRes, deptRes, mcoRes] = await Promise.all([
        supabase
          .from('map_tpv_receta')
          .select(
            'articulo_id, factor_porcion, recipe_id, recipes(id,name,photo_url,sale_price,presentation,elaboration), bdp_articulos(id,nombre,precio_base,departamento_id)'
          )
          .limit(5000),
        supabase.from('digital_menu_overrides').select('*').limit(5000),
        supabase.from('bdp_departamentos').select('id, nombre').limit(5000),
        supabase.from('menu_category_overrides').select('category_id, override_name_es, override_name_ca, override_name_en').limit(5000),
      ])

      let categoriesRes = await supabase
        .from('categories')
        .select('id, name, parent_id, sort_order, cover_articulo_id')
        .eq('scope', 'menu')
        .limit(5000)
      if (categoriesRes.error) {
        const legacy = await supabase
          .from('categories')
          .select('id, name, parent_id, sort_order')
          .eq('scope', 'menu')
          .limit(5000)
        if (legacy.error) throw legacy.error
        categoriesRes = {
          ...legacy,
          data: ((legacy.data ?? []) as any[]).map((c) => ({ ...c, cover_articulo_id: null })),
        }
      }

      if (mapRes.error) throw mapRes.error
      if (overridesRes.error) throw overridesRes.error
      if (deptRes.error) throw deptRes.error
      if (mcoRes.error) throw mcoRes.error

      const mcoById = new Map<
        string,
        { override_name_es: string | null; override_name_ca: string | null; override_name_en: string | null }
      >()
      for (const r of (mcoRes.data ?? []) as any[]) {
        mcoById.set(r.category_id, {
          override_name_es: r.override_name_es ?? null,
          override_name_ca: r.override_name_ca ?? null,
          override_name_en: r.override_name_en ?? null,
        })
      }

      const deptNombreById = new Map<number, string>()
      for (const d of (deptRes.data ?? []) as { id: number; nombre: string }[]) {
        deptNombreById.set(d.id, d.nombre)
      }

      const cats = ((categoriesRes.data ?? []) as any[]).map((c) => ({
        ...c,
        cover_articulo_id: c.cover_articulo_id ?? null,
      })) as CategoryRow[]
      setCategories(cats)

      const catMap = new Map(cats.map((c) => [c.id, c] as const))
      const overrides = (overridesRes.data ?? []) as OverrideRow[]
      const ovByArt = new Map<number, OverrideRow>()
      for (const o of overrides) ovByArt.set(o.articulo_id, o)

      const parents = cats.filter((c) => !c.parent_id)
      const coverIds = [...new Set(parents.map((p) => p.cover_articulo_id).filter((x): x is number => x != null))]
      const coverPhotoByArticulo = new Map<number, string | null>()
      if (coverIds.length) {
        const { data: covMaps, error: covErr } = await supabase
          .from('map_tpv_receta')
          .select('articulo_id, recipes(photo_url)')
          .in('articulo_id', coverIds)
        if (covErr) throw covErr
        const { data: covOvs, error: covOvsErr } = await supabase
          .from('digital_menu_overrides')
          .select('articulo_id, override_photo_url')
          .in('articulo_id', coverIds)
        if (covOvsErr) throw covOvsErr
        const ovPhoto = new Map<number, string | null>()
        for (const r of (covOvs ?? []) as any[]) {
          ovPhoto.set(r.articulo_id, ntrim(r.override_photo_url))
        }
        for (const r of (covMaps ?? []) as any[]) {
          const rec0 = r.recipes
          const rec = Array.isArray(rec0) ? rec0[0] : rec0
          const ph = ntrim(rec?.photo_url ?? null)
          const ovr = ovPhoto.get(r.articulo_id) ?? null
          coverPhotoByArticulo.set(r.articulo_id, ovr ?? ph)
        }
      }

      const parentCoverUrl = new Map<string, string | null>()
      for (const p of parents) {
        if (!p.cover_articulo_id) {
          parentCoverUrl.set(p.id, null)
          continue
        }
        parentCoverUrl.set(p.id, coverPhotoByArticulo.get(p.cover_articulo_id) ?? null)
      }

      const mapRows = (mapRes.data ?? []) as unknown as MapRow[]
      const rows: DigitalMenuRow[] = []

      const coverOptions = mapRows
        .map((r) => {
          const a = r.bdp_articulos
          if (!a) return null
          return { articulo_id: r.articulo_id, articulo_nombre: a.nombre }
        })
        .filter(Boolean) as Array<{ articulo_id: number; articulo_nombre: string }>
      setItemsForCover(coverOptions)

      for (const m of mapRows) {
        const a0 = m.bdp_articulos
        const r0 = m.recipes
        const a = Array.isArray(a0) ? a0[0] : a0
        const r = Array.isArray(r0) ? r0[0] : r0
        if (!a || !r) continue
        const o = ovByArt.get(m.articulo_id) ?? null
        const catId = o?.category_id ?? null
        const c = catId ? catMap.get(catId) ?? null : null
        const cp = c?.parent_id ? catMap.get(c.parent_id) ?? null : null

        const category_parent_id = c ? (c.parent_id ? cp?.id ?? null : c.id) : null
        const category_parent_name = c ? (c.parent_id ? cp?.name ?? null : c.name) : null
        const pOvr = category_parent_id ? mcoById.get(category_parent_id) : undefined
        const pBase = category_parent_name?.trim() || 'Sin categoría'
        const category_parent_name_es = ntrim(pOvr?.override_name_es) || pBase
        const category_parent_name_ca = ntrim(pOvr?.override_name_ca) || pBase
        const category_parent_name_en = ntrim(pOvr?.override_name_en) || pBase
        const category_parent_sort_order = c ? (c.parent_id ? cp?.sort_order ?? null : c.sort_order) : null
        const category_child_id = c?.parent_id ? c.id : null
        const category_child_name = c?.parent_id ? c.name : null
        const chOvr = category_child_id ? mcoById.get(category_child_id) : undefined
        const chBase = category_child_name?.trim() || ''
        const category_child_name_es = chBase ? ntrim(chOvr?.override_name_es) || chBase : null
        const category_child_name_ca = chBase ? ntrim(chOvr?.override_name_ca) || chBase : null
        const category_child_name_en = chBase ? ntrim(chOvr?.override_name_en) || chBase : null
        const category_child_sort_order = c?.parent_id ? c.sort_order : null

        const parentForCover = category_parent_id
        const category_parent_cover_photo_url =
          parentForCover != null ? parentCoverUrl.get(parentForCover) ?? null : null

        const precioRaw =
          o?.override_precio != null && String(o.override_precio).trim() !== ''
            ? o.override_precio
            : a.precio_base != null && String(a.precio_base).trim() !== ''
              ? a.precio_base
              : r.sale_price

        const fp = Number(m.factor_porcion ?? 1)
        const tpv_factor_porcion = Number.isFinite(fp) ? fp : 1

        const photo_url = ntrim(o?.override_photo_url) ?? ntrim(r.photo_url)

        const did = a.departamento_id
        const departamento_nombre =
          did != null && deptNombreById.has(did) ? (deptNombreById.get(did) ?? null) : null

        rows.push({
          articulo_id: m.articulo_id,
          articulo_nombre: a.nombre,
          editor_is_hidden: o?.is_hidden ?? false,
          carta_nombre: ntrim(o?.override_nombre) ?? a.nombre,
          carta_nombre_es: ntrim(o?.override_nombre_es) ?? ntrim(o?.override_nombre) ?? a.nombre,
          carta_nombre_ca: ntrim(o?.override_nombre_ca) ?? ntrim(o?.override_nombre) ?? a.nombre,
          carta_nombre_en: ntrim(o?.override_nombre_en) ?? ntrim(o?.override_nombre) ?? a.nombre,
          departamento_id: a.departamento_id ?? null,
          departamento_nombre,
          category_id: catId,
          category_parent_id,
          category_parent_name,
          category_parent_name_es,
          category_parent_name_ca,
          category_parent_name_en,
          category_parent_sort_order,
          category_parent_cover_photo_url,
          category_child_id,
          category_child_name,
          category_child_name_es,
          category_child_name_ca,
          category_child_name_en,
          category_child_sort_order,
          recipe_id: r.id,
          recipe_name: r.name,
          descripcion: buildDescripcion(o, r),
          precio: precioRaw != null ? Number(precioRaw) : null,
          photo_url,
          sort_order: o?.sort_order ?? null,
          tpv_factor_porcion,
        })
      }

      setDigitalRows(rows)
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo cargar el editor de carta')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persistParentCategoryOrder = async (orderedKeys: string[]): Promise<boolean> => {
    const uuidOrder = orderedKeys.filter((k) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(k)
    )
    const input = uuidOrder.map((category_id, i) => ({ category_id, sort_order: (i + 1) * 10 }))
    const res = await setMenuCategorySortOrders(input)
    if (!res.success) {
      toast.error(res.error ?? 'No se pudo guardar el orden de secciones')
      return false
    }
    toast.success('Orden de secciones guardado')
    await load({ silent: true })
    return true
  }

  const persistChildCategoryOrder = async (_parentKey: string, orderedChildKeys: string[]): Promise<boolean> => {
    const uuidOrder = orderedChildKeys.filter((k) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(k)
    )
    const input = uuidOrder.map((category_id, i) => ({ category_id, sort_order: (i + 1) * 10 }))
    const res = await setMenuCategorySortOrders(input)
    if (!res.success) {
      toast.error(res.error ?? 'No se pudo guardar el orden de subcategorías')
      return false
    }
    toast.success('Orden de subcategorías guardado')
    await load({ silent: true })
    return true
  }

  const persistProductOrder = async (
    _parentKey: string,
    _subKey: string,
    orderedArticuloIds: number[]
  ): Promise<boolean> => {
    try {
      for (let i = 0; i < orderedArticuloIds.length; i++) {
        const articulo_id = orderedArticuloIds[i]!
        const res = await upsertMenuOverride({ articulo_id, sort_order: i })
        if (!res.success) {
          toast.error(res.error ?? 'No se pudo guardar el orden de productos')
          return false
        }
      }
      toast.success('Orden de productos guardado')
      await load({ silent: true })
      return true
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo guardar el orden de productos')
      return false
    }
  }

  const onToggleVisible = (articulo_id: number) => {
    const row = digitalRows.find((x) => x.articulo_id === articulo_id)
    const nextHidden = !(row?.editor_is_hidden ?? false)
    setDigitalRows((rows) =>
      rows.map((r) => (r.articulo_id === articulo_id ? { ...r, editor_is_hidden: nextHidden } : r))
    )
    startTransition(async () => {
      setSavingArticuloId(articulo_id)
      try {
        const res = await upsertMenuOverride({ articulo_id, is_hidden: nextHidden })
        if (!res.success) {
          toast.error(res.error ?? 'No se pudo guardar')
          await load({ silent: true })
          return
        }
        await load({ silent: true })
      } finally {
        setSavingArticuloId(null)
      }
    })
  }

  if (!canEdit) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center shadow-sm" role="alert">
        <p className="text-sm font-bold text-red-800">No tienes permisos para editar la carta.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-zinc-100 bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" />
      </div>
    )
  }

  return (
    <>
      <MenuAccordion
        items={digitalRows}
        {...(onLangChange ? { lang, onLangChange } : {})}
        hideLangPicker
        editMode
        onEditParentCategory={(id) => setCategoryModalId(id)}
        onEditChildCategory={(id) => setCategoryModalId(id)}
        onEditProduct={(id) => setItemModalArticuloId(id)}
        onToggleProductActive={onToggleVisible}
        productToggleBusyId={savingArticuloId}
        onPersistParentCategoryOrder={persistParentCategoryOrder}
        onPersistChildCategoryOrder={persistChildCategoryOrder}
        onPersistProductOrder={persistProductOrder}
      />

      <MenuCategoryEditModal
        open={categoryForModal != null}
        onClose={() => {
          setCategoryModalId(null)
          void load({ silent: true })
        }}
        category={categoryForModal}
        itemsForCover={itemsForCover}
      />

      <MenuItemEditModal
        open={itemModalArticuloId != null}
        onClose={() => {
          setItemModalArticuloId(null)
          void load({ silent: true })
        }}
        articuloId={itemModalArticuloId}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          parent_id: c.parent_id,
          sort_order: c.sort_order,
        }))}
      />
    </>
  )
}
