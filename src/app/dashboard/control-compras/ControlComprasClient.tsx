'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, ClipboardCheck, FileSearch, Loader2, RefreshCw, ChevronDown } from 'lucide-react'
import { PageScreen } from '@/components/dashboard/DashboardDetailLayout'
import { LineMappingModal } from '@/components/albaranes/LineMappingModal'
import { IngredientCreateForm } from '@/components/ingredients/IngredientCreateForm'
import { Modal } from '@/components/ui/modal'
import { getPurchaseInvoiceDetailAction, getInvoiceStockStatusesAction, type PurchaseInvoiceLine } from '@/app/dashboard/albaranes/actions'
import { getControlComprasDataAction, type ControlComprasData, type PurchaseObservation, type PurchasePriceEvent, type PurchaseReview } from './actions'

type Result = Awaited<ReturnType<typeof getControlComprasDataAction>>
type AlertItem = {
  id: string; type: 'price' | 'quantity' | 'supplier' | 'duplicate'; severity: 'high' | 'medium' | 'opportunity'
  title: string; detail: string; date: string; ingredientId: string; supplierId: number | null
  category: string; invoiceId: string | null; score: number
}
const euro = (v: number, decimals = 2) => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: decimals, maximumFractionDigits: decimals })
const number = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 })
const percent = (v: number) => (v > 0 ? '+' : '') + v.toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' %'
const shortDate = (s: string) => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : 'Sin fecha'
const median = (arr: number[]) => {
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2] + sorted[sorted.length / 2 - 1]) / 2
}
const PAGE_SIZE = 3

function Pager({ total, page, onChange }: { total: number; page: number; onChange: (next: number) => void }) {
  const count = Math.max(1, Math.ceil(total / PAGE_SIZE))
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-zinc-500">
      <span className="tabular-nums">{page + 1} / {count}</span>
      <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)}
        className="flex h-7 w-7 items-center justify-center rounded-lg disabled:opacity-25" aria-label="Página anterior"><ChevronLeft size={18} /></button>
      <button type="button" disabled={page + 1 >= count} onClick={() => onChange(page + 1)}
        className="flex h-7 w-7 items-center justify-center rounded-lg disabled:opacity-25" aria-label="Página siguiente"><ChevronRight size={18} /></button>
    </div>
  )
}
function Panel({ title, detail, children, footer }: { title: string; detail?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/65 bg-white/95 p-2.5 shadow-[0_8px_30px_rgba(7,32,58,0.11)]">
      <div className="mb-2 shrink-0">
        <h2 className="text-sm font-bold text-[#173C56]">{title}</h2>
        {detail ? <p className="text-[10px] text-zinc-500">{detail}</p> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      {footer ? <div className="mt-1 shrink-0">{footer}</div> : null}
    </section>
  )
}

export default function ControlComprasClient({ initial }: { initial: Result }) {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<ControlComprasData | null>(initial.success ? initial.data : null)
  const [error, setError] = useState(initial.success ? '' : initial.message)
  const [period, setPeriod] = useState(90)
  const [category, setCategory] = useState('Todas')
  const [supplier, setSupplier] = useState('Todos')
  const [alertFilter, setAlertFilter] = useState('Todos')
  const [alertPage, setAlertPage] = useState(0)
  const [reviewPage, setReviewPage] = useState(0)
  const [reviewExpanded, setReviewExpanded] = useState(false)
  const [pricePage, setPricePage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [editorBusy, setEditorBusy] = useState(false)
  const [editorLine, setEditorLine] = useState<PurchaseInvoiceLine | null>(null)
  const [editorInvoice, setEditorInvoice] = useState<string | null>(null)
  const [editorSupplier, setEditorSupplier] = useState<number | null>(null)
  const [stockApplied, setStockApplied] = useState(false)
  const [reviewForEditor, setReviewForEditor] = useState<PurchaseReview | null>(null)
  const [creatingIngredientFor, setCreatingIngredientFor] = useState<PurchaseReview | null>(null)
  const [focusedIngredient, setFocusedIngredient] = useState<string | null>(null)

  const refresh = useCallback(async (days: number, silent = false) => {
    if (!silent) setLoading(true)
    try {
      const result = await getControlComprasDataAction(days)
      if (result.success) {
        setSnapshot(result.data)
        setError('')
      } else setError(result.message)
    } catch {
      setError('No se pudo actualizar el análisis.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) void refresh(period, true) }, 60_000)
    const onVisible = () => { if (!document.hidden) void refresh(period, true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [period, refresh])

  const filteredObservations = useMemo(() => (snapshot?.observations ?? []).filter(r =>
    (category === 'Todas' || r.category === category) &&
    (supplier === 'Todos' || String(r.supplierId) === supplier)), [snapshot, category, supplier])
  const filteredEvents = useMemo(() => (snapshot?.priceEvents ?? []).filter(r =>
    (category === 'Todas' || r.category === category) &&
    (supplier === 'Todos' || String(r.supplierId) === supplier)), [snapshot, category, supplier])
  const filteredReviews = useMemo(() => (snapshot?.reviews ?? []).filter(r =>
    (category === 'Todas' || r.category === category) &&
    (supplier === 'Todos' || String(r.supplierId) === supplier)), [snapshot, category, supplier])

  const alerts = useMemo(() => {
    const result: AlertItem[] = []
    const recentEventIds = new Set<string>()
    for (const p of filteredEvents) {
      if (recentEventIds.has(p.ingredientId)) continue
      recentEventIds.add(p.ingredientId)
      if (Math.abs(p.variation) < 12) continue
      result.push({
        id: 'p-' + p.id, type: 'price',
        severity: p.variation >= 20 ? 'high' : p.variation > 0 ? 'medium' : 'opportunity',
        title: p.ingredient + ' · ' + percent(p.variation),
        detail: euro(p.oldPrice) + ' → ' + euro(p.newPrice) + '/' + p.unit + ' · ' + p.supplier,
        date: p.date, ingredientId: p.ingredientId, supplierId: p.supplierId,
        category: p.category, invoiceId: p.invoiceId, score: Math.abs(p.variation),
      })
    }
    const byIngredient = new Map<string, PurchaseObservation[]>()
    for (const row of filteredObservations) {
      const key = row.ingredientId + '/' + row.supplierId
      byIngredient.set(key, [...(byIngredient.get(key) ?? []), row])
    }
    for (const rows of byIngredient.values()) {
      rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      const current = rows[0]
      const past = rows.slice(1).filter(r => r.unit === current.unit && r.quantity > 0).slice(0, 10)
      if (past.length < 4) continue
      const typical = median(past.map(r => r.quantity))
      if (typical > 0 && current.quantity >= 2.5 * typical) {
        result.push({
          id: 'q-' + current.id, type: 'quantity', severity: current.quantity > 4 * typical ? 'high' : 'medium',
          title: current.ingredient + ' · cantidad inusual',
          detail: number(current.quantity) + ' ' + current.unit + ' vs. ' + number(typical) + ' habituales · ' + current.supplier,
          date: current.date, ingredientId: current.ingredientId, supplierId: current.supplierId,
          category: current.category, invoiceId: current.invoiceId, score: current.quantity / typical,
        })
      }
    }
    // Solo se señala un proveedor diferente con al menos cuatro compras de referencia.
    const suppliersByIngredient = new Map<string, PurchaseObservation[]>()
    for (const row of filteredObservations) {
      suppliersByIngredient.set(row.ingredientId, [...(suppliersByIngredient.get(row.ingredientId) ?? []), row])
    }
    if (supplier === 'Todos') for (const rows of suppliersByIngredient.values()) {
      rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      const recent = rows[0], prior = rows.slice(1)
      if (prior.length < 4 || recent.supplierId == null) continue
      const counts = new Map<string, number>()
      for (const row of prior) counts.set(String(row.supplierId), (counts.get(String(row.supplierId)) ?? 0) + 1)
      const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      if (main && main[1] >= 3 && String(recent.supplierId) !== main[0] && !prior.some(r => r.supplierId === recent.supplierId)) {
        result.push({
          id: 's-' + recent.id, type: 'supplier', severity: 'medium',
          title: recent.ingredient + ' · proveedor no habitual',
          detail: 'Última recepción: ' + recent.supplier,
          date: recent.date, ingredientId: recent.ingredientId, supplierId: recent.supplierId,
          category: recent.category, invoiceId: recent.invoiceId, score: 1,
        })
      }
    }
    for (const item of snapshot?.duplicates ?? []) {
      if ((category !== 'Todas' && item.category !== category) ||
        (supplier !== 'Todos' && String(item.supplierId) !== supplier)) continue
      result.push({ id: 'd-' + item.id, type: 'duplicate', severity: 'medium',
        title: item.name + ' · posible duplicado',
        detail: 'Coinciden artículo, cantidad y precio en el mismo albarán · ' + item.supplier,
        date: item.date, ingredientId: item.ingredientId ?? '', supplierId: item.supplierId,
        category: item.category ?? '', invoiceId: item.invoiceId, score: 2 })
    }
    const severity = { high: 3, medium: 2, opportunity: 1 }
    return result.sort((a, b) => severity[b.severity] - severity[a.severity] || b.score - a.score)
  }, [filteredEvents, filteredObservations, supplier, category, snapshot?.duplicates])
  const shownAlerts = alerts.filter(a => alertFilter === 'Todos' || a.type === alertFilter)

  const priceItems = useMemo(() => {
    const byId = new Map<string, PurchasePriceEvent>()
    for (const p of filteredEvents) if (!byId.has(p.ingredientId)) byId.set(p.ingredientId, p)
    return [...byId.values()].sort((a, b) => Math.abs(b.variation) - Math.abs(a.variation))
  }, [filteredEvents])
  const currentFocus = focusedIngredient
    ? priceItems.find(p => p.ingredientId === focusedIngredient) ?? null
    : priceItems[0] ?? null
  const focusedObservation = (focusedIngredient
    ? filteredObservations.filter(r => r.ingredientId === focusedIngredient)
    : filteredObservations).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  const expense = filteredObservations.reduce((sum, row) => sum + row.amount, 0)
  const increases = priceItems.filter(p => p.variation >= 12).length
  const chart = useMemo(() => {
    const days = snapshot?.periodDays ?? 90
    const bucketCount = days === 7 ? 7 : 8
    const counts = Array.from({ length: bucketCount }, (_, i) => ({ index: i, amount: 0 }))
    const step = days / bucketCount
    const now = Date.parse(snapshot?.refreshedAt ?? '2000-01-01T00:00:00.000Z')
    for (const row of filteredObservations) {
      const age = (now - Date.parse(row.date + 'T12:00:00Z')) / 86_400_000
      if (age < 0 || age > days) continue
      const index = Math.max(0, Math.min(bucketCount - 1, bucketCount - 1 - Math.floor(age / step)))
      counts[index].amount += row.amount
    }
    return counts
  }, [filteredObservations, snapshot])
  const maxChart = Math.max(1, ...chart.map(c => c.amount))

  const openReview = async (line: PurchaseReview) => {
    setEditorBusy(true)
    try {
      const detail = await getPurchaseInvoiceDetailAction(line.invoiceId)
      if (!detail.success) { setError(detail.message); return }
      const actualLine = detail.detail.lines.find(r => r.id === line.id)
      if (!actualLine) { setError('Esta línea ya no está disponible en el albarán.'); void refresh(period); return }
      const stock = await getInvoiceStockStatusesAction({ lineIds: [line.id] })
      if (!stock.success) { setError(stock.message); return }
      setStockApplied(Boolean(stock.statuses.find(s => s.lineId === line.id)?.stockApplied))
      setEditorLine(actualLine)
      setEditorInvoice(detail.detail.id)
      setEditorSupplier(detail.detail.supplier_id)
      setReviewForEditor(line)
      setError('')
    } catch { setError('No se ha podido abrir la revisión de esta línea.') }
    finally { setEditorBusy(false) }
  }

  return (
    <PageScreen title="Control compras" subtitle="Costes de producto y revisión de albaranes"
      backHref="/dashboard" maxWidthClass="max-w-[1600px]" template="list" work="catalog"
      className="min-h-0 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto"
      cardClassName="!min-h-0 !bg-transparent !border-0 !shadow-none !overflow-visible"
      contentClassName="min-h-0 !p-0">
      <div className="flex min-h-0 flex-col gap-2 text-[#173C56]">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div className="flex min-w-0 gap-2">
            <select aria-label="Periodo" className="h-9 rounded-lg bg-white/90 px-2 text-xs shadow-sm"
              value={period} onChange={e => { const next = Number(e.target.value); setPeriod(next); setAlertPage(0); setPricePage(0); void refresh(next) }}>
              {[7, 30, 90, 365].map(d => <option key={d} value={d}>{d} días</option>)}
            </select>
            <select aria-label="Categoría" className="h-9 max-w-36 rounded-lg bg-white/90 px-2 text-xs shadow-sm"
              value={category} onChange={e => { setCategory(e.target.value); setAlertPage(0); setReviewPage(0); setPricePage(0) }}>
              <option>Todas</option>{snapshot?.categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="Proveedor" className="h-9 max-w-44 rounded-lg bg-white/90 px-2 text-xs shadow-sm"
              value={supplier} onChange={e => { setSupplier(e.target.value); setAlertPage(0); setReviewPage(0); setPricePage(0) }}>
              <option value="Todos">Todos</option>
              {snapshot?.suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>
          <button type="button" title="Actualizar datos reales" onClick={() => void refresh(period)} disabled={loading}
            className="flex h-9 items-center gap-1 rounded-lg bg-white/90 px-3 text-xs font-bold shadow-sm disabled:opacity-40">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
        {error ? <div className="shrink-0 rounded-lg bg-rose-50 px-3 py-1 text-xs text-rose-700">{error}</div> : null}
        <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-gradient-to-br from-[#286B9D] to-[#24618F] p-3 text-white">
            <div className="text-[11px] text-blue-100">Valor de recepciones confirmadas</div>
            <div className="text-2xl font-bold tabular-nums">{euro(expense, 0)}</div>
            <div className="text-[10px] text-blue-100">{filteredObservations.length} confirmaciones</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-[#218C70] to-[#1D7E65] p-3 text-white">
            <div className="text-[11px] text-emerald-50">Subidas importantes</div>
            <div className="text-2xl font-bold tabular-nums">{increases}</div>
            <div className="text-[10px] text-emerald-50">Variaciones ≥ 12 %</div>
          </div>
          <div className="rounded-2xl bg-white/95 p-3 shadow-sm">
            <div className="text-[11px] text-zinc-500">Señales de revisión</div>
            <div className="text-2xl font-bold tabular-nums">{shownAlerts.length}</div>
            <div className="text-[10px] text-zinc-500">Precios, cantidades y proveedores</div>
          </div>
          <div className="rounded-2xl bg-white/95 p-3 shadow-sm">
            <div className="text-[11px] text-zinc-500">Líneas por completar</div>
            <div className="text-2xl font-bold tabular-nums">{filteredReviews.length}</div>
            <div className="text-[10px] text-zinc-500">Pendientes de todos los periodos</div>
          </div>
        </div>

        <section className="shrink-0 overflow-hidden rounded-xl border border-white/65 bg-white/90 shadow-[0_4px_18px_rgba(7,32,58,0.08)]">
          <button type="button" aria-expanded={reviewExpanded} aria-controls="control-compras-revision"
            onClick={() => setReviewExpanded(value => !value)}
            className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left">
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#173C56]">
              <FileSearch size={17} className="shrink-0 text-[#286B9D]" />
              Revisión de albaranes
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
              {filteredReviews.length} pendientes
              <ChevronDown size={17} className={`transition-transform ${reviewExpanded ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {reviewExpanded ? (
            <div id="control-compras-revision" className="border-t border-slate-200/70 px-3 pb-2 pt-1">
              {filteredReviews.length === 0 ? (
                <p className="py-3 text-center text-xs text-green-700"><Check size={15} className="mr-1 inline" /> Sin líneas pendientes</p>
              ) : (
                <div className="grid grid-cols-1 gap-x-3 md:grid-cols-2 lg:grid-cols-3">
                  {filteredReviews.slice(reviewPage * PAGE_SIZE, (reviewPage + 1) * PAGE_SIZE).map(r =>
                    <button key={r.id} type="button" disabled={editorBusy} onClick={() => void openReview(r)}
                      className="flex min-w-0 items-center justify-between gap-2 border-b border-slate-200/70 py-1.5 text-left disabled:opacity-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold text-[#173C56]">{r.name}</span>
                        <span className="block truncate text-[10px] text-zinc-500">{r.supplier} · {shortDate(r.date)}</span>
                        <span className="block truncate text-[10px] text-amber-700">{r.reason}</span>
                      </span>
                      <FileSearch size={16} className="shrink-0 text-[#286B9D]" />
                    </button>)}
                </div>
              )}
              <Pager total={filteredReviews.length} page={Math.min(reviewPage, Math.max(0, Math.ceil(filteredReviews.length / PAGE_SIZE) - 1))}
                onChange={setReviewPage} />
            </div>
          ) : null}
        </section>

        <div className="grid min-h-0 grid-cols-1 gap-2 lg:h-[min(60dvh,530px)] lg:min-h-[480px] lg:grid-cols-12 lg:grid-rows-2">
          <div className="min-h-[260px] lg:col-span-7 lg:min-h-0">
            <Panel title="Alertas detectadas" detail="Compras confirmadas; umbral de precio ±12 %"
              footer={<Pager total={shownAlerts.length} page={Math.min(alertPage, Math.max(0, Math.ceil(shownAlerts.length / PAGE_SIZE) - 1))} onChange={setAlertPage} />}>
              <div className="mb-1 flex gap-1">
                {[['Todos', 'Todas'], ['price', 'Precio'], ['quantity', 'Cantidad'], ['supplier', 'Proveedor'], ['duplicate', 'Duplicados']].map(([key, label]) =>
                  <button key={key} type="button" onClick={() => { setAlertFilter(key); setAlertPage(0) }}
                    className={`rounded-md px-2 py-1 text-[10px] ${alertFilter === key ? 'bg-[#286B9D] text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}
              </div>
              {shownAlerts.length === 0 ? <p className="py-5 text-center text-xs text-zinc-500">Sin alertas que cumplan los criterios.</p> :
                shownAlerts.slice(alertPage * PAGE_SIZE, (alertPage + 1) * PAGE_SIZE).map(alert =>
                  <button key={alert.id} type="button" onClick={() => alert.type === 'duplicate' ? router.push('/dashboard/albaranes') : setFocusedIngredient(alert.ingredientId)}
                    className="flex w-full items-center gap-2 border-b border-slate-100 py-1 text-left last:border-0">
                    <span className={`h-7 w-7 shrink-0 rounded-lg p-1.5 ${alert.severity === 'high' ? 'bg-red-50 text-red-600' : alert.severity === 'opportunity' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-700'}`}>
                      {alert.severity === 'opportunity' ? <ArrowDown size={16} /> : <AlertTriangle size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-bold">{alert.title}</span>
                      <span className="block truncate text-[10px] text-zinc-500">{alert.detail}</span>
                    </span>
                    <ChevronRight size={14} className="shrink-0 text-slate-400" />
                  </button>)}
            </Panel>
          </div>
          <div className="min-h-[240px] lg:col-span-5 lg:min-h-0">
            <Panel title="Evolución de compras" detail="Recepciones confirmadas; sin duplicar facturas">
              <div className="flex h-full flex-col justify-between">
                <div className="flex min-h-[90px] flex-1 items-end gap-1 border-b border-slate-200 py-2">
                  {chart.map(row =>
                    <div key={row.index} title={euro(row.amount, 0)} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      <div className="w-full rounded-t bg-[#347FA5]" style={{ height: `${Math.max(2, row.amount / maxChart * 100)}%` }} />
                      <span className="text-[9px] text-zinc-400">{row.index + 1}</span>
                    </div>)}
                </div>
                <div className="pt-2 text-xs text-zinc-600">
                  <div className="flex justify-between"><span>Albaranes del periodo</span><b>{snapshot?.activeInvoices ?? '—'}</b></div>
                  <div className="flex justify-between"><span>Ingredientes recibidos</span><b>{new Set(filteredObservations.map(r => r.ingredientId)).size}</b></div>
                  <p className="mt-1 text-[9px] text-zinc-500">Valor calculado con precios normalizados y cantidades confirmadas, sin impuestos añadidos.</p>
                </div>
              </div>
            </Panel>
          </div>
          <div className="min-h-[260px] lg:col-span-7 lg:min-h-0">
            <Panel title="Control de precios por ingrediente" detail="Último cambio entre recepciones confirmadas; € por unidad de compra"
              footer={<Pager total={priceItems.length} page={Math.min(pricePage, Math.max(0, Math.ceil(priceItems.length / PAGE_SIZE) - 1))} onChange={setPricePage} />}>
              <div className="grid grid-cols-[minmax(0,1fr)_70px_70px_66px] border-b border-slate-200 pb-1 text-[9px] font-bold uppercase text-zinc-500">
                <span>Ingrediente</span><span className="text-right">Anterior</span><span className="text-right">Actual</span><span className="text-right">Cambio</span>
              </div>
              {priceItems.slice(pricePage * PAGE_SIZE, (pricePage + 1) * PAGE_SIZE).map(p =>
                <button key={p.id} type="button" onClick={() => setFocusedIngredient(p.ingredientId)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_70px_70px_66px] items-center border-b border-slate-100 py-2 text-[11px] last:border-0">
                  <span className="truncate text-left font-bold">{p.ingredient}</span>
                  <span className="text-right text-zinc-500 tabular-nums">{euro(p.oldPrice)}</span>
                  <span className="text-right font-semibold tabular-nums">{euro(p.newPrice)}</span>
                  <span className={`text-right font-bold tabular-nums ${p.variation >= 12 ? 'text-red-600' : p.variation <= -12 ? 'text-green-700' : 'text-zinc-500'}`}>{percent(p.variation)}</span>
                </button>)}
              {priceItems.length === 0 ? <p className="pt-5 text-center text-xs text-zinc-500">Sin cambios de precio en este periodo.</p> : null}
            </Panel>
          </div>
          <div className="min-h-[245px] lg:col-span-5 lg:min-h-0">
            <Panel title="Detalle de variación" detail="Dato económico trazable al histórico">
              {currentFocus ? (
                <div className="flex h-full flex-col justify-between gap-2">
                  <div>
                    <div className="text-base font-bold">{currentFocus.ingredient}</div>
                    <div className="text-[11px] text-zinc-500">{currentFocus.category} · {currentFocus.supplier} · {shortDate(currentFocus.date)}</div>
                    <div className="mt-2 flex items-center gap-2 text-xl font-bold tabular-nums">
                      {euro(currentFocus.newPrice)}
                      <span className={`rounded-md px-2 py-1 text-xs ${currentFocus.variation > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                        {currentFocus.variation > 0 ? <ArrowUp size={13} className="inline" /> : <ArrowDown size={13} className="inline" />}
                        {percent(currentFocus.variation)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600">Antes: {euro(currentFocus.oldPrice)}/{currentFocus.unit} · Ahora: {euro(currentFocus.newPrice)}/{currentFocus.unit}</p>
                    <p className="mt-1 text-[10px] text-zinc-500">Origen: dos recepciones confirmadas</p>
                  </div>
                  <button type="button" onClick={() => router.push('/dashboard/albaranes')}
                    className="flex h-9 items-center justify-center gap-2 rounded-lg bg-[#286B9D] text-xs font-bold text-white">
                    <ClipboardCheck size={16} /> Consultar albaranes
                  </button>
                </div>
              ) : focusedObservation ? (
                <div className="flex h-full flex-col justify-between gap-2">
                  <div>
                    <div className="text-base font-bold">{focusedObservation.ingredient}</div>
                    <div className="text-[11px] text-zinc-500">{focusedObservation.supplier} · {shortDate(focusedObservation.date)}</div>
                    <div className="mt-2 text-xl font-bold tabular-nums">{euro(focusedObservation.unitPrice)}/{focusedObservation.unit}</div>
                    <p className="mt-1 text-xs text-zinc-600">Cantidad confirmada: {number(focusedObservation.quantity)} {focusedObservation.unit} · Valor: {euro(focusedObservation.amount)}</p>
                    <p className="mt-1 text-[10px] text-zinc-500">Sin variación de precio registrada en el periodo.</p>
                  </div>
                  <button type="button" onClick={() => router.push('/dashboard/albaranes')}
                    className="flex h-9 items-center justify-center gap-2 rounded-lg bg-[#286B9D] text-xs font-bold text-white">
                    <ClipboardCheck size={16} /> Consultar albaranes
                  </button>
                </div>
              ) : <div className="flex h-full items-center justify-center text-xs text-zinc-500">Selecciona un ingrediente para ver su evolución.</div>}
            </Panel>
          </div>
        </div>
        <div className="shrink-0 text-[10px] text-white/85">
          Datos reales · Supabase · Actualizado {snapshot ? new Date(snapshot.refreshedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'} · Alertas orientativas; la revisión económica la valida K4.
        </div>
      </div>
      {editorBusy ? <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs shadow-lg"><Loader2 size={16} className="animate-spin" /> Abriendo revisión…</div> : null}
      <LineMappingModal open={!!editorLine} line={editorLine}
        invoiceId={editorInvoice} supplierId={editorSupplier} stockApplied={stockApplied}
        onClose={() => { setEditorLine(null); setEditorInvoice(null) }}
        onSuccess={async () => { await refresh(period, true) }}
        onCompleted={async () => { setEditorLine(null); setEditorInvoice(null); await refresh(period, true) }}
        onCreateIngredient={() => {
          if (!reviewForEditor) return
          setEditorLine(null)
          setEditorInvoice(null)
          setCreatingIngredientFor(reviewForEditor)
        }} />
      <Modal open={creatingIngredientFor !== null}
        onClose={() => {
          const returnToLine = creatingIngredientFor
          setCreatingIngredientFor(null)
          if (returnToLine) void openReview(returnToLine)
        }}
        variant="compact" layer="base" instance="control-compras-ingredient-create"
        usageId="control-compras-ingredient-create" usageLabel="Crear ingrediente"
        title="Nuevo ingrediente" ariaLabel="Crear ingrediente">
        {creatingIngredientFor ? <IngredientCreateForm
          initialName={creatingIngredientFor.name}
          context={{ lineLabel: creatingIngredientFor.name }}
          onCreated={async () => { await refresh(period, true) }}
          onClose={() => {
            const returnToLine = creatingIngredientFor
            setCreatingIngredientFor(null)
            if (returnToLine) void openReview(returnToLine)
          }} /> : null}
      </Modal>
    </PageScreen>
  )
}
