'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Check, ChevronLeft, ChevronRight, Settings2, X } from 'lucide-react'
import { openPreferredRearCamera } from '@/lib/replenishment/preferred-camera'
import { detectCanEnds } from '@/lib/replenishment/vision'
import { useCocaColaGridTracking } from './useCocaColaGridTracking'
import {
  COLA_LAYOUT, computeStackTotals, mergeStackReading,
  stableHint, visibleStackHint, type StackCounts, type StackPosition,
} from '@/lib/replenishment/assisted-scan'

const W = 320
const H = 240
const positionLabel = (p: StackPosition) => 'Fila ' + p.row + ', columna ' + p.column
const allPositions = COLA_LAYOUT

export function CocaColaAssistedScan({
  fridgeName, onBack, onSettings, fridges, currentFridgeId, onFridgeChange,
}: {
  fridgeName: string
  onBack: () => void
  onSettings?: () => void
  fridges: { id: string; name: string }[]
  currentFridgeId: string
  onFridgeChange: (id: string) => void
}) {
  const [activeId, setActiveId] = useState(allPositions[0].id)
  const [counts, setCounts] = useState<StackCounts>({})
  const [scanning, setScanning] = useState(true)
  const [mapOpen, setMapOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [hint, setHint] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const history = useRef<(number | null)[]>([])

  const active = allPositions.find(p => p.id === activeId) ?? allPositions[0]
  const current = counts[active.id]
  const original = useMemo(() => computeStackTotals(allPositions.filter(p => p.product === 'original'), counts), [counts])
  const zero = useMemo(() => computeStackTotals(allPositions.filter(p => p.product === 'zero'), counts), [counts])
  const totals = useMemo(() => computeStackTotals(allPositions, counts), [counts])

  const choose = (id: string) => {
    setActiveId(id)
    setHint(null)
    history.current = []
  }
  const tracking = useCocaColaGridTracking(activeId, choose)
  const activeIndex = allPositions.findIndex(p => p.id === active.id)
  const changePile = (delta: number) => {
    choose(allPositions[(activeIndex + delta + allPositions.length) % allPositions.length].id)
  }
  const trackFrameRef = useRef(tracking.renderFrame)
  useEffect(() => { trackFrameRef.current = tracking.renderFrame }, [tracking.renderFrame])

  const confirm = (amount: number, method: 'manual' | 'confirmed-suggestion') => {
    setCounts(prev => mergeStackReading(prev, active.id, amount, method))
    setHint(null)
    history.current = []
    const index = allPositions.findIndex(p => p.id === active.id)
    const next = [...allPositions.slice(index + 1), ...allPositions.slice(0, index)].find(p => !counts[p.id])
    if (next) setActiveId(next.id)
    else setSummaryOpen(true)
  }

  const frame = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return
    const source = document.createElement('canvas')
    source.width = W
    source.height = H
    const ctx = source.getContext('2d', { willReadFrequently: true })
    const overlay = canvas.getContext('2d')
    if (!ctx || !overlay) return
    const ratio = W / H
    const sourceRatio = video.videoWidth / video.videoHeight
    const sw = sourceRatio > ratio ? video.videoHeight * ratio : video.videoWidth
    const sh = sourceRatio > ratio ? video.videoHeight : video.videoWidth / ratio
    ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2,
      sw, sh, 0, 0, W, H)
    const image = ctx.getImageData(0, 0, W, H)
    const circles = detectCanEnds(image)
    overlay.clearRect(0, 0, W, H)
    overlay.strokeStyle = 'rgba(255,255,255,0.9)'
    overlay.lineWidth = 2
    overlay.strokeRect(W * .27, H * .14, W * .46, H * .72)
    overlay.strokeStyle = 'rgba(34,197,94,0.9)'
    for (const circle of circles) {
      overlay.beginPath()
      overlay.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2)
      overlay.stroke()
    }
    trackFrameRef.current(image, overlay, circles)
    const candidate = visibleStackHint(circles, W, H)
    history.current = [...history.current.slice(-2), candidate]
    setHint(stableHint(history.current))
  }, [])

  useEffect(() => {
    if (!scanning) return
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null
    let stream: MediaStream | null = null
    const video = videoRef.current
    const overlay = overlayRef.current
    async function open() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) { setError('La cámara requiere HTTPS y permisos del navegador.'); setScanning(false) }
        return
      }
      try {
        const { stream: next } = await openPreferredRearCamera()
        if (cancelled) { next.getTracks().forEach(t => t.stop()); return }
        stream = next
        if (!video || !overlay) { next.getTracks().forEach(t => t.stop()); return }
        video.srcObject = next
        await video.play()
        if (cancelled) return
        setError(null)
        timer = setInterval(() => frame(video, overlay), 700)
      } catch {
        if (!cancelled) { setError('No se pudo abrir la cámara. Revisa los permisos.'); setScanning(false) }
      }
    }
    void open()
    return () => {
      cancelled = true
      if (timer !== null) clearInterval(timer)
      stream?.getTracks().forEach(t => t.stop())
      if (video) video.srcObject = null
    }
  }, [scanning, frame])

  return (
    <div className="relative isolate h-full w-full overflow-hidden bg-zinc-950 text-white">
      {scanning && (
        <>
          <video ref={videoRef} muted autoPlay playsInline aria-label="Cámara de nevera Coca-Cola"
            className="absolute inset-0 h-full w-full object-cover" />
          <canvas ref={overlayRef} width={W} height={H} className="hidden" aria-hidden />
        </>
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/75 via-black/10 to-black/85" />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <header className="shrink-0 px-4 pt-[max(14px,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onBack} aria-label="Volver al inventario"
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/40 backdrop-blur-md">
              <ChevronLeft className="size-5" />
            </button>
            <select aria-label="Cambiar nevera" value={currentFridgeId}
              onChange={event => onFridgeChange(event.target.value)}
              className="h-11 min-w-0 flex-1 appearance-none rounded-full border border-white/25 bg-black/45 px-4 text-center text-base font-semibold text-white backdrop-blur-md">
              {fridges.map(fridge => <option key={fridge.id} value={fridge.id} className="text-zinc-950">{fridge.name}</option>)}
            </select>
            {onSettings && <button type="button" onClick={onSettings} aria-label="Configurar neveras"
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/40 backdrop-blur-md">
              <Settings2 className="size-5" />
            </button>}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 text-xs font-semibold text-white/85">
            <span>RECUENTO · {fridgeName}</span>
            <button type="button" onClick={() => setSummaryOpen(true)}
              className="rounded-full border border-white/25 bg-black/40 px-3 py-1.5">
              {totals.confirmed}/{totals.positions} pilas · Ver reposición
            </button>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-emerald-400 transition-all"
              style={{ width: (totals.confirmed / totals.positions * 100) + '%' }} />
          </div>
        </header>
        <div className="pointer-events-none mt-4 shrink-0 px-5">
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-300">Estás contando</span>
          <h1 className="mt-1 text-3xl font-bold drop-shadow-lg">
            {active.product === 'original' ? 'Coca-Cola' : 'Coca-Cola Zero'}
          </h1>
          <p className="mt-1 text-base font-medium text-white/90">
            {positionLabel(active)} · Pila {activeIndex + 1} de {allPositions.length}
          </p>
          <p className="mt-2 max-w-xs text-sm leading-snug text-white/80">
            Enfoca esta pila desde un lado. Cuenta las latas reales de esa pila, no toda la nevera.
          </p>
        </div>
        <div className="pointer-events-none flex min-h-0 flex-1 items-center justify-center px-5">
          {!scanning && (
            <div className="pointer-events-auto rounded-2xl border border-white/20 bg-black/75 p-5 text-center backdrop-blur-md">
              <Camera className="mx-auto size-8" />
              <p className="mt-2 text-sm">La cámara no está disponible. Puedes contar manualmente.</p>
              <button type="button" onClick={() => { setError(null); setScanning(true) }}
                className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950">
                Reintentar cámara
              </button>
            </div>
          )}
        </div>
        <section aria-label="Contar pila"
          className="shrink-0 overflow-y-auto rounded-t-[26px] border-t border-white/20 bg-zinc-950/85 px-4 pt-3 shadow-2xl backdrop-blur-xl"
          style={{ maxHeight: '62dvh', paddingBottom: 'max(14px,env(safe-area-inset-bottom))' }}>
          {error && <p role="alert" className="mb-2 text-sm text-amber-200">{error}</p>}
          <p className="mb-2 text-sm font-semibold">Cambia de producto</p>
          <div role="group" aria-label="Producto a contar" className="flex gap-2">
            {(['original', 'zero'] as const).map(product => {
              const group = product === 'original' ? original : zero
              return (
                <button type="button" key={product}
                  onClick={() => {
                    const zones = allPositions.filter(position => position.product === product)
                    choose((zones.find(position => !counts[position.id]) ?? zones[0]).id)
                  }}
                  aria-pressed={active.product === product}
                  className={'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold ' +
                    (active.product === product ? 'border-white bg-white text-zinc-950' : 'border-white/25 bg-white/10 text-white')}>
                  {group.confirmed === group.positions && <Check className="size-4" />}
                  {product === 'original' ? 'Coca-Cola' : 'Zero'}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => changePile(-1)} aria-label="Pila anterior"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => setMapOpen(true)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-white/25 bg-white/10 px-3 text-sm font-semibold">
              {positionLabel(active)} · Cambiar en el mapa
            </button>
            <button type="button" onClick={() => changePile(1)} aria-label="Pila siguiente"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10">
              <ChevronRight className="size-5" />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">¿Cuántas latas tiene esta pila?</p>
              <p className="text-xs text-white/60">Pulsa el número y avanzará sola.</p>
            </div>
            {current && <span className="text-xs font-semibold text-emerald-300">✓ {current.count} guardadas</span>}
          </div>
          <div role="group" aria-label="Latas en la pila" className="mt-2 grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4].map(amount => (
              <button key={amount} type="button" onClick={() => confirm(amount, 'manual')}
                aria-label={amount === 4 ? '4 o más latas' : amount + ' latas'}
                className={'flex h-14 items-center justify-center rounded-xl border text-xl font-bold ' +
                  (current?.count === amount ? 'border-emerald-400 bg-emerald-400 text-zinc-950' :
                    'border-white/25 bg-white/10 text-white')}>
                {amount === 4 ? '4+' : amount}
              </button>
            ))}
          </div>
          {hint !== null && scanning && (
            <button type="button" onClick={() => confirm(hint, 'confirmed-suggestion')}
              className="mt-2 w-full rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100">
              Cámara estima {hint >= 4 ? '4+' : hint} latas · Usar si coincide
            </button>
          )}
          <p className="mt-2 text-xs text-white/50">«4+» indica pila llena. Las latas ocultas deben comprobarse a mano.</p>
        </section>
      </div>
      {mapOpen && (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm">
          <section aria-label="Mapa de pilas"
            className="w-full max-w-lg overflow-y-auto rounded-3xl border border-white/20 bg-zinc-900 p-4"
            style={{ maxHeight: '85dvh', marginBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold">Elige la pila</h2>
              <button type="button" onClick={() => setMapOpen(false)} aria-label="Cerrar mapa"
                className="flex size-10 items-center justify-center rounded-full bg-white/10"><X className="size-5" /></button>
            </div>
            <p className="mb-3 text-xs text-white/65">Vista desde arriba · fila 1 al fondo, fila 7 junto a la puerta.</p>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }, (_, row) =>
                Array.from({ length: 7 }, (_, column) => {
                  const position = allPositions.find(item => item.row === row + 1 && item.column === column + 1)
                  if (!position) return <div key={'empty-' + row + '-' + column} aria-hidden />
                  const reading = counts[position.id]
                  return (
                    <button type="button" key={position.id}
                      aria-label={(position.product === 'original' ? 'Coca-Cola ' : 'Zero ') + positionLabel(position)}
                      aria-pressed={active.id === position.id}
                      onClick={() => { choose(position.id); setMapOpen(false) }}
                      className={'flex aspect-square min-w-0 flex-col items-center justify-center rounded-lg border text-[10px] font-semibold ' +
                        (active.id === position.id ? 'border-emerald-400 bg-emerald-500/45 text-white' :
                          reading ? 'border-emerald-700 bg-emerald-900/40 text-emerald-200' :
                            'border-white/15 bg-white/10 text-white/80')}>
                      <span>{position.product === 'original' ? 'CC' : 'Z'}</span>
                      <strong className="text-xs">{reading ? reading.count : '·'}</strong>
                    </button>
                  )
                }),
              )}
            </div>
            <p className="mt-3 text-xs text-white/60">Verde: contado · punto: pendiente.</p>
          </section>
        </div>
      )}
      {summaryOpen && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm">
          <section aria-label="Resumen de Coca-Cola"
            className="w-full max-w-lg overflow-y-auto rounded-3xl border border-white/20 bg-zinc-900 p-5"
            style={{ maxHeight: '85dvh', marginBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Para reponer</h2>
              <button type="button" onClick={() => setSummaryOpen(false)} aria-label="Cerrar resumen"
                className="flex size-10 items-center justify-center rounded-full bg-white/10"><X className="size-5" /></button>
            </div>
            {([['Coca-Cola', original], ['Coca-Cola Zero', zero]] as const).map(([name, group]) => (
              <div key={name} className="mt-4 flex items-center justify-between border-b border-white/15 pb-3">
                <div>
                  <p className="font-semibold">{name}</p>
                  <p className="text-xs text-white/65">{group.confirmed}/{group.positions} pilas revisadas</p>
                </div>
                <div className="text-right">
                  <strong className="text-2xl">{group.totalMissing ?? '—'}</strong>
                  <span className="ml-1 text-xs">ud.</span>
                </div>
              </div>
            ))}
            <p className="mt-3 text-sm font-medium text-emerald-300">
              {totals.totalMissing === null
                ? 'Todavía quedan ' + (totals.positions - totals.confirmed) + ' pilas sin contar.'
                : 'Total para reponer: ' + totals.totalMissing + ' latas.'}
            </p>
            <button type="button" onClick={() => setSummaryOpen(false)}
              className="mt-4 h-12 w-full rounded-xl bg-white font-bold text-zinc-950">
              {totals.totalMissing === null ? 'Seguir contando' : 'Volver a cámara'}
            </button>
            {confirmReset ? (
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => { setCounts({}); choose(allPositions[0].id); setConfirmReset(false); setSummaryOpen(false) }}
                  className="flex-1 rounded-xl border border-red-400 px-3 py-2 text-sm text-red-200">
                  Confirmar nuevo recuento
                </button>
                <button type="button" onClick={() => setConfirmReset(false)}
                  className="rounded-xl border border-white/20 px-3 py-2 text-sm">Cancelar</button>
              </div>
            ) : <button type="button" onClick={() => setConfirmReset(true)}
              className="mt-3 w-full py-2 text-sm text-white/65">Iniciar otro recuento</button>}
          </section>
        </div>
      )}
    </div>
  )
}
