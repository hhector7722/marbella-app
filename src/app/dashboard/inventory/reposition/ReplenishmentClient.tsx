'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Camera, Check, Settings2, Trash2 } from 'lucide-react'
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
  const [isScanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [detected, setDetected] = useState<number | null>(null)
  const [stable, setStable] = useState<number | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
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
  const activeSlot = fridgeSlots.find(s => s.id === slotId) ?? fridgeSlots[0] ?? null
  const activeSlotId = activeSlot?.id ?? ''

  const activateSlot = (id: string) => {
    setScanning(false)
    setSlotId(id)
    setObserved('')
    setDetected(null)
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
    setDetected(count)
    historyRef.current = [...historyRef.current.slice(-3), count]
    const multiplier = activeSlot?.units_per_position ?? 1
    const stablePositions = isStableCount(historyRef.current,
      Math.floor((activeSlot?.capacity ?? 0) / multiplier))
    setStable(stablePositions === null ? null : stablePositions * multiplier)
  }, [activeSlot?.capacity, activeSlot?.units_per_position])

  useEffect(() => {
    if (!isScanning) return
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
        const result = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        })
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
        onFrame(video, overlay)
        timer = setInterval(() => onFrame(video, overlay), 750)
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
  }, [isScanning, onFrame])

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

  const saveCount = () => {
    if (!activeSlot) return
    const value = Number(observed)
    if (observed.trim() === '' || !Number.isInteger(value) || value < 0 || value > activeSlot.capacity) {
      toast.error('Introduce un número entre 0 y ' + activeSlot.capacity + '.')
      return
    }
    setConfirmed(previous => ({
      ...previous,
      [activeSlot.id]: { count: value, source: stable === value ? 'camera' : 'manual' },
    }))
    setScanning(false)
    const next = fridgeSlots.find(s => s.id !== activeSlot.id && confirmed[s.id] === undefined)
    if (next) activateSlot(next.id)
    toast.success('Nivel registrado.')
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
    activateSlot('')
  }

  const rightSlot = canManage ? (
    <Button variant="tertiary" instance="replenishment-settings" icon={<Settings2 />}
      aria-label="Configurar neveras" onClick={() => setConfigOpen(v => !v)} />
  ) : undefined

  return (
    <PageScreen title="Reposición visual" backHref="/dashboard/inventory" template="detail"
      rightSlot={rightSlot} maxWidthClass="max-w-3xl">
      <div className="flex flex-col gap-4 p-3 sm:p-5">
        {error ? (
          <Notice instance="replenishment-load-error" variant="negative">{error}</Notice>
        ) : (
          <>
            {fridges.length === 0 ? (
              <Notice instance="replenishment-setup-empty" variant="info">
                Gerencia debe configurar primero la nevera, cada producto, sus niveles y sus capacidades.
              </Notice>
            ) : (
              <>
                <Field instance="replenishment-fridge" label="Nevera" htmlFor="replenishment-fridge">
                  <select id="replenishment-fridge" className={fieldClass} value={currentFridgeId}
                    onChange={event => selectFridge(event.target.value)}>
                    {fridges.map(fridge => (
                      <option key={fridge.id} value={fridge.id}>{fridge.name}</option>
                    ))}
                  </select>
                </Field>
                {fridgeSlots.length === 0 ? (
                  <Notice instance="replenishment-slots-empty" variant="info">
                    Esta nevera no tiene zonas configuradas. Añádelas desde Configurar.
                  </Notice>
                ) : (
                  <>
                    <Field instance="replenishment-slot" label="Producto y nivel a escanear" htmlFor="replenishment-slot">
                      <select id="replenishment-slot" className={fieldClass} value={activeSlotId}
                        onChange={event => activateSlot(event.target.value)}>
                        {fridgeSlots.map(slot => (
                          <option key={slot.id} value={slot.id}>
                            {unitLabel(slot, productNames)}
                            {confirmed[slot.id] ? ' ✓' : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {activeSlot && (
                      <Surface variant="block" instance="replenishment-capture" className="flex flex-col gap-3 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-zinc-900">{unitLabel(activeSlot, productNames)}</span>
                          <span className="text-xs tabular-nums text-zinc-500">{activeSlot.capacity / activeSlot.units_per_position} posiciones × {activeSlot.units_per_position} ud. = {activeSlot.capacity}</span>
                        </div>
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-zinc-950">
                          {isScanning ? (
                            <>
                              <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover"
                                playsInline autoPlay muted aria-label="Cámara de reposición" />
                              <canvas ref={overlayRef} width={WORK_WIDTH} height={WORK_HEIGHT}
                                className="pointer-events-none absolute inset-0 h-full w-full" />
                              <div className="absolute bottom-2 left-2 rounded bg-black/75 px-3 py-2 text-white">
                                <span className="block text-xs">Posiciones visibles estimadas</span>
                                <strong className="text-2xl tabular-nums">{detected ?? '—'}</strong>
                                <span className="ml-2 text-xs">{stable !== null ? 'Estable' : 'Buscando…'}</span>
                                {stable !== null && activeSlot ? (
                                  <span className="mt-1 block text-xs font-semibold">
                                    Faltarían {activeSlot.capacity - stable} · estimación sin confirmar
                                  </span>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-white">
                              <Camera className="h-8 w-8" />
                              <p className="max-w-xs px-4 text-sm">
                                Enfoca solo las bases de este producto y nivel. Muestra los niveles ocultos por separado.
                              </p>
                            </div>
                          )}
                        </div>
                        {cameraError && <Notice instance="replenishment-camera-error" variant="negative">{cameraError}</Notice>}
                        <div className="flex flex-wrap gap-2">
                          <Button variant="secondary" instance="replenishment-toggle-camera"
                            onClick={() => {
                              setCameraError(null)
                              if (!isScanning) {
                                setDetected(null)
                                setStable(null)
                                historyRef.current = []
                              }
                              setScanning(v => !v)
                            }}>
                            {isScanning ? 'Detener cámara' : 'Abrir cámara'}
                          </Button>
                          {isScanning && (
                            <Button variant="tertiary" instance="replenishment-accept-detection"
                              disabled={stable === null} onClick={() => setObserved(String(stable))}>
                              Usar detección
                            </Button>
                          )}
                        </div>
                        <Field instance="replenishment-observed" label="Unidades presentes (revisar y corregir)" htmlFor="replenishment-observed">
                          <input type="number" inputMode="numeric" id="replenishment-observed"
                            className={fieldClass} min={0} max={activeSlot.capacity} step={1}
                            value={observed} onChange={event => setObserved(event.target.value)}
                            placeholder="Introduce o acepta el recuento" />
                        </Field>
                        <Button variant="primary" layout="fill" instance="replenishment-confirm-level" onClick={saveCount}>
                          Confirmar este nivel
                        </Button>
                        <p className="text-xs text-zinc-500">
                          El reconocimiento es orientativo: cada círculo se multiplica por {activeSlot.units_per_position} unidades
                          según la distribución. La cámara no puede comprobar las latas ocultas ni detectar pilas parcialmente vacías.
                          Revisa y corrige la cantidad real antes de confirmar.
                        </p>
                      </Surface>
                    )}
                    <Surface variant="block" instance="replenishment-result" className="flex flex-col gap-3 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-base font-semibold">Para reponer</h2>
                        <span className="text-xs text-zinc-500">
                          {pending === 0 ? 'Todos los niveles revisados' : pending + ' niveles pendientes'}
                        </span>
                      </div>
                      {productTotals.map(product => (
                        <div key={product.name} className="flex items-center justify-between gap-3 border-b border-zinc-100 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-900">{product.name}</p>
                            {product.pending > 0 && <p className="text-xs text-amber-700">{product.pending} nivel(es) sin contar</p>}
                          </div>
                          <strong className="text-xl tabular-nums text-zinc-900">
                            {product.pending ? '—' : product.missing}
                          </strong>
                        </div>
                      ))}
                      {pending === 0 ? (
                        <p className="text-sm font-semibold text-emerald-700">
                          <Check className="mr-1 inline h-4 w-4" />
                          Total: {totalMissing} unidades para completar la nevera
                        </p>
                      ) : (
                        <Notice instance="replenishment-incomplete" variant="warning">
                          Recuento incompleto: no se calcula un total definitivo hasta revisar todas las zonas.
                        </Notice>
                      )}
                    </Surface>
                  </>
                )}
              </>
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
          </>
        )}
      </div>
      <ConfirmModal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.kind === 'fridge' ? 'Eliminar nevera' : 'Eliminar zona'}
        instance="replenishment-delete-confirm" usageLabel="Eliminar configuración de reposición"
        confirmLabel="Eliminar" confirmVariant="destructive" confirming={busy}
        onConfirm={() => void confirmDelete()}>
        Se eliminará esta configuración, sin modificar el inventario ni los movimientos de stock.
      </ConfirmModal>
    </PageScreen>
  )
}
