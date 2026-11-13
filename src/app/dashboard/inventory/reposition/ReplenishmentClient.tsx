'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Camera, Check, ChevronLeft, Settings2, Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { openPreferredRearCamera } from '@/lib/replenishment/preferred-camera'
import { PageScreen } from '@/components/dashboard/DashboardDetailLayout'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/Field'
import { Notice } from '@/components/ui/Notice'
import { Surface } from '@/components/ui/Surface'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import {
  createReplenishmentFridge, createReplenishmentSlot,
  deleteReplenishmentFridge, deleteReplenishmentSlot,
} from './actions'
import { detectCanEnds, isStableCount, missingUnits } from '@/lib/replenishment/vision'
import { colaLayoutMatchesCapacities } from '@/lib/replenishment/assisted-scan'
import { CocaColaAssistedScan } from './CocaColaAssistedScan'

export type Fridge = { id: string; name: string }
export type Slot = {
  id: string
  fridge_id: string
  ingredient_id: string
  label: string
  level_number: number
  capacity: number
  units_per_position: number
  sort_order: number
}
export type Product = { id: string; name: string; base_unit: string }
type Confirmed = { count: number; source: 'camera' | 'manual' }
type DeleteTarget = { kind: 'fridge' | 'slot'; id: string } | null

const fieldClass = 'w-full min-h-12 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900'
const WORK_WIDTH = 320
const WORK_HEIGHT = 240
const noopSubscribe = () => () => {}

function unitLabel(slot: Slot, products: Map<string, string>): string {
  const name = products.get(slot.ingredient_id) ?? 'Producto'
  return name + (slot.label ? ' · ' + slot.label : '') + (slot.level_number > 1 ? ' · Fila ' + slot.level_number : '')
}

export function ReplenishmentClient({ fridges, slots, products, canManage, error }: {
  fridges: Fridge[]
  slots: Slot[]
  products: Product[]
  canManage: boolean
  error: string | null
}) {
  const router = useRouter()
  const [fridgeId, setFridgeId] = useState(fridges[0]?.id ?? '')
  const [slotId, setSlotId] = useState('')
  const [confirmed, setConfirmed] = useState<Record<string, Confirmed>>({})
  const [observed, setObserved] = useState('')
  const [isScanning, setScanning] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [stable, setStable] = useState<number | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const [fridgeName, setFridgeName] = useState('')
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [slotLabel, setSlotLabel] = useState('')
  const [level, setLevel] = useState('1')
  const [capacity, setCapacity] = useState('12')
  const [unitsPerPosition, setUnitsPerPosition] = useState('1')
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const historyRef = useRef<number[]>([])

  const productNames = useMemo(() => new Map(products.map(p => [p.id, p.name])), [products])
  const currentFridgeId = fridges.some(f => f.id === fridgeId) ? fridgeId : (fridges[0]?.id ?? '')
  const fridgeSlots = useMemo(
    () => slots.filter(s => s.fridge_id === currentFridgeId)
      .sort((a, b) => a.level_number - b.level_number || a.sort_order - b.sort_order),
    [slots, currentFridgeId],
  )
  const isConfiguredCola = fridges.find(f => f.id === currentFridgeId)?.name === 'Coca-cola'
    && fridgeSlots.length === 2
    && colaLayoutMatchesCapacities(
      fridgeSlots.filter(s => productNames.get(s.ingredient_id)?.toLowerCase() === 'coca cola')
        .reduce((total, slot) => total + slot.capacity, 0),
      fridgeSlots.filter(s => productNames.get(s.ingredient_id)?.toLowerCase() === 'coca cola zero')
        .reduce((total, slot) => total + slot.capacity, 0),
    )
  const activeSlot = fridgeSlots.find(s => s.id === slotId) ?? fridgeSlots[0] ?? null

  const activateSlot = (id: string) => {
    setSlotId(id)
    setObserved(confirmed[id] ? String(confirmed[id].count) : '')
    setStable(null)
    historyRef.current = []
  }

  const onFrame = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    if (!video.videoWidth || !video.videoHeight) return
    const frame = document.createElement('canvas')
    frame.width = WORK_WIDTH
    frame.height = WORK_HEIGHT
    const ctx = frame.getContext('2d', { willReadFrequently: true })
    const overlay = canvas.getContext('2d')
    if (!ctx || !overlay) return

    const ratio = WORK_WIDTH / WORK_HEIGHT
    const sourceRatio = video.videoWidth / video.videoHeight
    const sw = sourceRatio > ratio ? video.videoHeight * ratio : video.videoWidth
    const sh = sourceRatio > ratio ? video.videoHeight : video.videoWidth / ratio
    ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2,
      sw, sh, 0, 0, WORK_WIDTH, WORK_HEIGHT)
    const circles = detectCanEnds(ctx.getImageData(0, 0, WORK_WIDTH, WORK_HEIGHT))
    overlay.clearRect(0, 0, WORK_WIDTH, WORK_HEIGHT)
    overlay.strokeStyle = 'rgba(255,255,255,0.8)'
    overlay.lineWidth = 1.5
    overlay.strokeRect(WORK_WIDTH * 0.09, WORK_HEIGHT * 0.12,
      WORK_WIDTH * 0.82, WORK_HEIGHT * 0.76)
    overlay.strokeStyle = 'rgba(5,150,105,0.95)'
    overlay.lineWidth = 2
    for (const circle of circles) {
      overlay.beginPath()
      overlay.arc(circle.x, circle.y, circle.radius, 0, 2 * Math.PI)
      overlay.stroke()
    }

    // Un círculo es una posición; el número de unidades ocultas se supone, no se observa.
    const count = circles.length
    historyRef.current = [...historyRef.current.slice(-3), count]
    const multiplier = activeSlot?.units_per_position ?? 1
    const stablePositions = isStableCount(historyRef.current,
      Math.floor((activeSlot?.capacity ?? 0) / multiplier))
    setStable(stablePositions === null ? null : stablePositions * multiplier)
  }, [activeSlot?.capacity, activeSlot?.units_per_position])
  const onFrameRef = useRef(onFrame)
  useEffect(() => { onFrameRef.current = onFrame }, [onFrame])

  useEffect(() => {
    if (!mounted || configOpen || !isScanning || isConfiguredCola || fridgeSlots.length === 0) return
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined
    let stream: MediaStream | undefined
    const videoElement = videoRef.current
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('El navegador no permite la cámara. Abre la aplicación mediante HTTPS.')
        setScanning(false)
        return
      }
      try {
        const { stream: result } = await openPreferredRearCamera()
        if (cancelled) { result.getTracks().forEach(t => t.stop()); return }
        stream = result
        const video = videoElement
        if (!video) { result.getTracks().forEach(t => t.stop()); return }
        video.srcObject = result
        await video.play()
        if (cancelled) return
        setCameraError(null)
        const overlay = overlayRef.current
        if (!overlay) return
        onFrameRef.current(video, overlay)
        timer = setInterval(() => onFrameRef.current(video, overlay), 750)
      } catch {
        if (!cancelled) {
          setCameraError('No se pudo abrir la cámara. Comprueba el permiso y que no esté ocupada.')
          setScanning(false)
        }
      }
    }
    void start()
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      stream?.getTracks().forEach(t => t.stop())
      if (videoElement) videoElement.srcObject = null
    }
  }, [isScanning, isConfiguredCola, fridgeSlots.length, configOpen, mounted])

  const productTotals = useMemo(() => {
    const grouped = new Map<string, { name: string; missing: number; pending: number }>()
    for (const slot of fridgeSlots) {
      const item = grouped.get(slot.ingredient_id) ?? {
        name: productNames.get(slot.ingredient_id) ?? 'Producto',
        missing: 0,
        pending: 0,
      }
      const value = missingUnits(slot.capacity, confirmed[slot.id]?.count ?? null)
      if (value === null) item.pending++
      else item.missing += value
      grouped.set(slot.ingredient_id, item)
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [fridgeSlots, confirmed, productNames])

  const pending = fridgeSlots.filter(s => !confirmed[s.id]).length
  const totalMissing = productTotals.reduce((n, p) => n + p.missing, 0)
  const productGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; zones: Slot[] }>()
    for (const slot of fridgeSlots) {
      const group = groups.get(slot.ingredient_id) ?? {
        id: slot.ingredient_id, name: productNames.get(slot.ingredient_id) ?? 'Producto', zones: [],
      }
      group.zones.push(slot)
      groups.set(slot.ingredient_id, group)
    }
    return [...groups.values()]
  }, [fridgeSlots, productNames])
  const currentProduct = productGroups.find(g => g.id === activeSlot?.ingredient_id)
  const currentFridge = fridges.find(f => f.id === currentFridgeId)
  const confirmedCount = fridgeSlots.length - pending
  const remaining = activeSlot ? missingUnits(activeSlot.capacity,
    observed.trim() !== '' && Number.isInteger(Number(observed)) && Number(observed) >= 0
      ? Number(observed) : null) : null

  useEffect(() => {
    if (!mounted || configOpen || error || fridges.length === 0) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [mounted, configOpen, error, fridges.length])
  const switchProduct = (id: string) => {
    const zones = productGroups.find(group => group.id === id)?.zones ?? []
    const candidate = zones.find(zone => !confirmed[zone.id]) ?? zones[0]
    if (candidate) { setSummaryOpen(false); activateSlot(candidate.id) }
  }
  const zoneLabel = (slot: Slot): string =>
    (slot.label?.trim() || (slot.level_number > 1 ? 'Fila ' + slot.level_number : 'Zona principal'))


  const saveCount = () => {
    if (!activeSlot) return
    const value = Number(observed)
    if (observed.trim() === '' || !Number.isInteger(value) || value < 0) {
      toast.error('Introduce un número válido de unidades presentes.')
      return
    }
    setConfirmed(previous => ({
      ...previous,
      [activeSlot.id]: { count: Math.min(activeSlot.capacity, value), source: stable === value ? 'camera' : 'manual' },
    }))
    const next = fridgeSlots.find(s => s.id !== activeSlot.id && confirmed[s.id] === undefined)
    if (next) activateSlot(next.id)
    else setSummaryOpen(true)
    toast.success(next ? 'Guardado. Sigue con la zona indicada.' : 'Nevera revisada.')
  }

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    try {
      await task()
      router.refresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Error al guardar.')
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    await run(() => target.kind === 'fridge'
      ? deleteReplenishmentFridge(target.id)
      : deleteReplenishmentSlot(target.id))
    if (target.kind === 'fridge') setFridgeId('')
    setConfirmed({})
  }

  const selectFridge = (id: string) => {
    setFridgeId(id)
    setSummaryOpen(false)
    activateSlot('')
  }

  return (
    <>
      {!mounted && !configOpen && !error && fridges.length > 0 && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950 text-sm text-white/70">
          Abriendo cámara…
        </div>
      )}
      {mounted && !configOpen && !error && fridges.length > 0 && createPortal(
        <main aria-label="Reponer nevera con cámara"
          className="fixed inset-0 z-[9999] overflow-hidden bg-zinc-950 text-white"
          style={{ height: '100dvh' }}>
          {isConfiguredCola ? (
            <CocaColaAssistedScan
              fridgeName={currentFridge?.name ?? 'Nevera'}
              onBack={() => router.push('/dashboard/inventory')}
              onSettings={canManage ? () => setConfigOpen(true) : undefined}
              fridges={fridges}
              currentFridgeId={currentFridgeId}
              onFridgeChange={selectFridge}
            />
          ) : (
            <div className="relative isolate h-full w-full overflow-hidden bg-zinc-950">
              {isScanning && activeSlot && (
                <>
                  <video ref={videoRef} autoPlay muted playsInline
                    aria-label="Cámara para contar productos"
                    className="absolute inset-0 h-full w-full object-cover" />
                  <canvas ref={overlayRef} width={WORK_WIDTH} height={WORK_HEIGHT} className="hidden" aria-hidden />
                </>
              )}
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/75 via-black/10 to-black/85" />
              <div className="relative z-10 flex h-full min-h-0 flex-col">
                <header className="shrink-0 px-4 pt-[max(14px,env(safe-area-inset-top))]">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => router.push('/dashboard/inventory')}
                      aria-label="Volver al inventario"
                      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/40 backdrop-blur-md">
                      <ChevronLeft className="size-5" />
                    </button>
                    <select aria-label="Cambiar nevera" value={currentFridgeId}
                      onChange={event => selectFridge(event.target.value)}
                      className="h-11 min-w-0 flex-1 appearance-none rounded-full border border-white/25 bg-black/45 px-4 text-center text-base font-semibold text-white backdrop-blur-md">
                      {fridges.map(fridge => <option key={fridge.id} value={fridge.id} className="text-zinc-950">{fridge.name}</option>)}
                    </select>
                    {canManage && <button type="button" onClick={() => setConfigOpen(true)}
                      aria-label="Configurar neveras"
                      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/40 backdrop-blur-md">
                      <Settings2 className="size-5" />
                    </button>}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold text-white/85">
                    <span>RECUENTO DE NEVERA</span>
                    <button type="button" onClick={() => setSummaryOpen(true)}
                      className="rounded-full border border-white/25 bg-black/40 px-3 py-1.5 text-white">
                      {confirmedCount} de {fridgeSlots.length} zonas · Ver reposición
                    </button>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/25">
                    <div className="h-full rounded-full bg-emerald-400 transition-all"
                      style={{ width: (fridgeSlots.length ? confirmedCount / fridgeSlots.length * 100 : 0) + '%' }} />
                  </div>
                </header>
                <div className="pointer-events-none mt-4 shrink-0 px-5">
                  <span className="text-xs font-bold uppercase tracking-widest text-emerald-300">Estás contando</span>
                  <h1 className="mt-1 text-3xl font-bold leading-tight drop-shadow-lg">
                    {currentProduct?.name ?? 'Sin zonas configuradas'}
                  </h1>
                  {activeSlot && (
                    <p className="mt-1 text-base font-medium text-white/90">
                      Zona: {zoneLabel(activeSlot)}
                    </p>
                  )}
                  <p className="mt-2 max-w-[320px] text-sm leading-snug text-white/80">
                    {activeSlot ? 'Enfoca solo este producto en la zona indicada, no toda la nevera.' :
                      'Configura primero las zonas de esta nevera.'}
                  </p>
                </div>
                <div className="pointer-events-none flex min-h-0 flex-1 items-center justify-center px-5">
                  {!isScanning && activeSlot && (
                    <div className="pointer-events-auto rounded-2xl border border-white/20 bg-black/75 p-5 text-center backdrop-blur-md">
                      <Camera className="mx-auto size-8 text-white/80" />
                      <p className="mt-2 text-sm">No se pudo mostrar la cámara.</p>
                      <button type="button" className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
                        onClick={() => { setCameraError(null); setScanning(true) }}>Reintentar cámara</button>
                    </div>
                  )}
                </div>
                <section aria-label="Controles del recuento"
                  className="shrink-0 overflow-y-auto rounded-t-[26px] border-t border-white/20 bg-zinc-950/85 px-4 pt-3 shadow-2xl backdrop-blur-xl"
                  style={{ maxHeight: '62dvh', paddingBottom: 'max(14px,env(safe-area-inset-bottom))' }}>
                  {cameraError && <p role="alert" className="mb-2 text-sm text-amber-200">{cameraError}</p>}
                  {activeSlot ? (
                    <>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">Cambia de producto</p>
                        <span className="shrink-0 text-xs text-white/55">{productGroups.length} productos</span>
                      </div>
                      <div role="group" aria-label="Productos" className="flex gap-2 overflow-x-auto pb-2">
                        {productGroups.map(group => {
                          const selected = group.id === activeSlot.ingredient_id
                          const done = group.zones.every(zone => confirmed[zone.id] !== undefined)
                          return (
                            <button key={group.id} type="button" onClick={() => switchProduct(group.id)}
                              aria-pressed={selected}
                              className={'flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors ' +
                                (selected ? 'border-white bg-white text-zinc-950' : 'border-white/25 bg-white/10 text-white')}>
                              {done && <Check className="size-4" />}
                              {group.name}
                            </button>
                          )
                        })}
                      </div>
                      {(currentProduct?.zones.length ?? 0) > 1 && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="shrink-0 text-xs text-white/65">Zona:</span>
                          <div role="group" aria-label="Zonas del producto"
                            className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
                            {currentProduct?.zones.map(zone => (
                              <button key={zone.id} type="button" onClick={() => activateSlot(zone.id)}
                                aria-pressed={zone.id === activeSlot.id}
                                className={'shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium ' +
                                  (zone.id === activeSlot.id ? 'border-emerald-400 bg-emerald-400/25 text-white' :
                                    'border-white/20 bg-white/5 text-white/80')}>
                                {confirmed[zone.id] && '✓ '}{zoneLabel(zone)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">¿Cuántas hay ahora?</p>
                          <p className="text-xs text-white/60">Capacidad: {activeSlot.capacity} ud.</p>
                        </div>
                        {stable !== null && isScanning && (
                          <button type="button" onClick={() => setObserved(String(stable))}
                            className="rounded-lg border border-emerald-400/60 bg-emerald-500/20 px-2.5 py-2 text-xs font-semibold text-emerald-100">
                            Cámara estima {stable} · Usar
                          </button>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" aria-label="Restar una unidad"
                          disabled={observed.trim() === '' || Number(observed) <= 0}
                          onClick={() => setObserved(String(Math.max(0, Number(observed) - 1)))}
                          className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-2xl disabled:opacity-30">−</button>
                        <input type="number" inputMode="numeric" min={0} step={1} id="replenishment-observed"
                          aria-label="Unidades presentes" placeholder="—" value={observed}
                          onChange={event => setObserved(event.target.value)}
                          className="h-12 w-full min-w-0 rounded-xl border border-white/30 bg-white/10 px-2 text-center text-2xl font-bold tabular-nums text-white outline-none focus:border-emerald-400" />
                        <button type="button" aria-label="Sumar una unidad"
                          onClick={() => setObserved(String(Math.max(0, Number(observed) || 0) + 1))}
                          className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-2xl">+</button>
                        <div className="min-w-[80px] shrink-0 text-right">
                          <p className="text-[11px] text-white/60">Faltan</p>
                          <p className="text-2xl font-bold tabular-nums text-emerald-300">{remaining ?? '—'}</p>
                        </div>
                      </div>
                      <button type="button" onClick={saveCount}
                        disabled={observed.trim() === '' || !Number.isInteger(Number(observed)) || Number(observed) < 0}
                        className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-emerald-400 text-base font-bold text-zinc-950 transition-colors disabled:bg-white/20 disabled:text-white/40">
                        {pending > (confirmed[activeSlot.id] ? 0 : 1)
                          ? 'Guardar y pasar a la siguiente zona' : 'Guardar y ver reposición'}
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfigOpen(true)}
                      className="h-12 w-full rounded-xl bg-white font-semibold text-zinc-950">
                      Configurar nevera
                    </button>
                  )}
                </section>
              </div>
              {summaryOpen && (
                <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm">
                  <section aria-label="Resumen para reponer"
                    className="w-full max-w-lg overflow-y-auto rounded-3xl border border-white/20 bg-zinc-900 p-5 shadow-2xl"
                    style={{ maxHeight: '85dvh', marginBottom: 'env(safe-area-inset-bottom)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xl font-bold">Para reponer</h2>
                      <button type="button" aria-label="Cerrar resumen" onClick={() => setSummaryOpen(false)}
                        className="flex size-10 items-center justify-center rounded-full bg-white/10"><X className="size-5" /></button>
                    </div>
                    <p className="mt-1 text-sm text-white/65">{confirmedCount}/{fridgeSlots.length} zonas revisadas</p>
                    <div className="mt-4 space-y-3">
                      {productTotals.map(product => (
                        <div key={product.name} className="flex items-center justify-between border-b border-white/10 pb-3">
                          <div>
                            <p className="font-medium">{product.name}</p>
                            {product.pending > 0 && <p className="text-xs text-amber-300">{product.pending} zonas pendientes</p>}
                          </div>
                          <strong className="text-2xl tabular-nums">
                            {product.pending ? '—' : product.missing}
                            <span className="ml-1 text-xs font-normal">ud.</span>
                          </strong>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-sm font-medium text-emerald-300">
                      {pending === 0 ? 'Total: ' + totalMissing + ' unidades para llenar la nevera.' :
                        'Completa las zonas pendientes para calcular el total definitivo.'}
                    </p>
                    <button type="button" onClick={() => setSummaryOpen(false)}
                      className="mt-4 h-12 w-full rounded-xl bg-white font-bold text-zinc-950">
                      {pending === 0 ? 'Volver a la cámara' : 'Seguir contando'}
                    </button>
                  </section>
                </div>
              )}
            </div>
          )}
        </main>,
        document.body
      )}
      {(configOpen || error || fridges.length === 0) && (
        <PageScreen title="Configurar neveras" template="detail" backHref="/dashboard/inventory"
          maxWidthClass="max-w-3xl"
          rightSlot={configOpen ? <Button variant="secondary" instance="replenishment-close-settings"
            onClick={() => setConfigOpen(false)}>Volver a la cámara</Button> : undefined}>
          <div className="flex flex-col gap-4 p-3 sm:p-5">
            {error && <Notice instance="replenishment-load-error" variant="negative">{error}</Notice>}
            {fridges.length === 0 && <Notice instance="replenishment-setup-empty" variant="info">
              Configura una nevera para empezar el recuento.
            </Notice>}
            {fridges.length > 0 && (
              <Field instance="replenishment-fridge" label="Nevera" htmlFor="replenishment-fridge">
                <select id="replenishment-fridge" className={fieldClass} value={currentFridgeId}
                  onChange={event => selectFridge(event.target.value)}>
                  {fridges.map(fridge => <option key={fridge.id} value={fridge.id}>{fridge.name}</option>)}
                </select>
              </Field>
            )}
            {canManage && (configOpen || fridges.length === 0) && (
              <Surface variant="block" instance="replenishment-config" className="flex flex-col gap-4 p-3">
                <h2 className="text-base font-semibold">Configuración de neveras</h2>
                <form className="flex flex-col gap-2" onSubmit={event => {
                  event.preventDefault()
                  void run(async () => { await createReplenishmentFridge(fridgeName); setFridgeName('') })
                }}>
                  <Field instance="replenishment-new-fridge" label="Nueva nevera" htmlFor="replenishment-new-fridge">
                    <input id="replenishment-new-fridge" className={fieldClass} maxLength={80}
                      value={fridgeName} onChange={event => setFridgeName(event.target.value)}
                      placeholder="Ej. Cámara de refrescos" />
                  </Field>
                  <Button type="submit" variant="secondary" instance="replenishment-create-fridge"
                    disabled={busy || !fridgeName.trim()}>Añadir nevera</Button>
                </form>
                {currentFridgeId && (
                  <>
                    <div className="border-t border-zinc-200 pt-3">
                      <form className="flex flex-col gap-2" onSubmit={event => {
                        event.preventDefault()
                        void run(async () => {
                          await createReplenishmentSlot({
                            fridgeId: currentFridgeId, ingredientId: productId, label: slotLabel,
                            level: Number(level), capacity: Number(capacity), unitsPerPosition: Number(unitsPerPosition),
                          })
                          setSlotLabel('')
                        })
                      }}>
                        <Field instance="replenishment-new-product" label="Producto" htmlFor="replenishment-new-product">
                          <select id="replenishment-new-product" className={fieldClass} value={productId}
                            onChange={event => setProductId(event.target.value)}>
                            {products.map(product => (
                              <option key={product.id} value={product.id}>{product.name}</option>
                            ))}
                          </select>
                        </Field>
                        <Field instance="replenishment-new-label" label="Zona (opcional)" htmlFor="replenishment-new-label">
                          <input id="replenishment-new-label" className={fieldClass} maxLength={80}
                            value={slotLabel} onChange={event => setSlotLabel(event.target.value)}
                            placeholder="Ej. Columna izquierda" />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field instance="replenishment-new-level" label="Fila o grupo" htmlFor="replenishment-new-level">
                            <input id="replenishment-new-level" className={fieldClass} type="number"
                              min={1} max={30} step={1} required value={level}
                              onChange={event => setLevel(event.target.value)} />
                          </Field>
                          <Field instance="replenishment-new-capacity" label="Capacidad total (unidades)" htmlFor="replenishment-new-capacity">
                            <input id="replenishment-new-capacity" className={fieldClass} type="number"
                              min={1} max={500} step={1} required value={capacity}
                              onChange={event => setCapacity(event.target.value)} />
                          </Field>
                        </div>
                        <Field instance="replenishment-new-multiplier" label="Unidades por posición visible (1 botella; 4 latas apiladas)" htmlFor="replenishment-new-multiplier">
                          <input id="replenishment-new-multiplier" className={fieldClass} type="number"
                            min={1} max={20} step={1} required value={unitsPerPosition}
                            onChange={event => setUnitsPerPosition(event.target.value)} />
                        </Field>
                        <Button type="submit" variant="primary" instance="replenishment-add-slot"
                          disabled={busy || !productId}>Añadir zona</Button>
                      </form>
                    </div>
                    <div className="border-t border-zinc-200 pt-3">
                      <h3 className="mb-2 text-sm font-semibold">Zonas configuradas</h3>
                      {fridgeSlots.map(slot => (
                        <div key={slot.id} className="flex min-h-12 items-center justify-between gap-2 border-b border-zinc-100">
                          <span className="min-w-0 text-sm">{unitLabel(slot, productNames)} · {slot.capacity / slot.units_per_position} × {slot.units_per_position} = {slot.capacity} ud.</span>
                          <Button variant="tertiary" instance={'replenishment-delete-' + slot.id}
                            icon={<Trash2 className="h-4 w-4" />} aria-label="Eliminar zona"
                            onClick={() => setDeleteTarget({ kind: 'slot', id: slot.id })} />
                        </div>
                      ))}
                      <div className="mt-3">
                        <Button variant="destructive" instance="replenishment-delete-fridge"
                          onClick={() => setDeleteTarget({ kind: 'fridge', id: currentFridgeId })}>
                          Eliminar nevera
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </Surface>
            )}

          </div>
        </PageScreen>
      )}
      <ConfirmModal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.kind === 'fridge' ? 'Eliminar nevera' : 'Eliminar zona'}
        instance="replenishment-delete-confirm" usageLabel="Eliminar configuración de reposición"
        confirmLabel="Eliminar" confirmVariant="destructive" confirming={busy}
        onConfirm={() => void confirmDelete()}>
        Se eliminará esta configuración, sin modificar el inventario ni los movimientos de stock.
      </ConfirmModal>
    </>
  )
}
