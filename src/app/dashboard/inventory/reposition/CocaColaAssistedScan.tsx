'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/Notice'
import { Surface } from '@/components/ui/Surface'
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

export function CocaColaAssistedScan() {
  const [activeId, setActiveId] = useState(allPositions[0].id)
  const [counts, setCounts] = useState<StackCounts>({})
  const [scanning, setScanning] = useState(false)
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
  const trackFrameRef = useRef(tracking.renderFrame)
  useEffect(() => { trackFrameRef.current = tracking.renderFrame }, [tracking.renderFrame])

  const confirm = (amount: number, method: 'manual' | 'confirmed-suggestion') => {
    setCounts(prev => mergeStackReading(prev, active.id, amount, method))
    setHint(null)
    history.current = []
    const index = allPositions.findIndex(p => p.id === active.id)
    const next = [...allPositions.slice(index + 1), ...allPositions.slice(0, index)].find(p => !counts[p.id])
    if (next) setActiveId(next.id)
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
        const next = await navigator.mediaDevices.getUserMedia({
          audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        })
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
    <div className="flex flex-col gap-3">
      <Surface instance="cola-assisted-map" variant="block" className="flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Mapa de pilas · Coca-Cola</h2>
          <span className="text-xs tabular-nums text-zinc-500">{totals.confirmed}/{totals.positions} confirmadas</span>
        </div>
        <p className="text-xs text-zinc-600">
          Selecciona la pila en el mapa o toca su posición sobre la cámara calibrada.
          Muéstrala desde distintos ángulos y confirma la cantidad. Filas del fondo hacia la puerta.
        </p>
        <div className="overflow-x-auto">
          <div className="grid min-w-[348px] grid-cols-7 gap-0.5">
            {Array.from({ length: 7 }, (_, row) =>
              Array.from({ length: 7 }, (_, col) => {
                const position = allPositions.find(p => p.row === row + 1 && p.column === col + 1)
                if (!position) return <div key={'hole-' + row + '-' + col} aria-hidden="true" className="h-12" />
                const saved = counts[position.id]
                const selected = active.id === position.id
                const tone = saved
                  ? saved.count >= 4 ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
                  : position.product === 'original' ? 'bg-red-100 text-red-900' : 'bg-zinc-200 text-zinc-800'
                return (
                  <button type="button" key={position.id}
                    data-design-exception="native-business-button:rejilla-de-pilas"
                    aria-label={positionLabel(position) + (saved ? ' · ' + saved.count + ' unidades' : ' · pendiente')}
                    aria-pressed={selected}
                    onClick={() => choose(position.id)}
                    className={'min-h-12 min-w-12 border text-xs tabular-nums ' +
                      (selected ? 'border-zinc-900 ring-2 ring-zinc-900 ' : 'border-zinc-200 ') + tone}>
                    <span className="block text-[10px]">{position.product === 'original' ? 'CC' : 'Zero'}</span>
                    <strong>{saved ? (saved.count >= 4 ? '4+' : saved.count) : tracking.seenIds.includes(position.id) ? '◦' : '·'}</strong>
                  </button>
                )
              }),
            )}
          </div>
        </div>
        <p className="text-xs text-zinc-500">Una quinta lata no cuenta como excedente, ni modifica otra pila.</p>
      </Surface>
      <Surface instance="cola-assisted-camera" variant="block" className="flex flex-col gap-3 p-3">
        <div className="flex justify-between gap-2">
          <span className="text-sm font-semibold">
            {positionLabel(active)} · {active.product === 'original' ? 'Coca-Cola' : 'Coca-Cola Zero'}
          </span>
          <span className="text-xs text-zinc-500">4 máximo</span>
        </div>
        {scanning && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button instance="cola-grid-calibrate" variant="secondary" onClick={tracking.calibrate}>
                {tracking.mode === 'tracking' ? 'Recalibrar mapa' : 'Calibrar mapa'}
              </Button>
              <span className="text-xs text-zinc-600">
                {tracking.mode === 'tracking' ? 'Mapa seguido · toca una pila en la cámara' :
                  tracking.mode === 'calibrating' ? 'Marca 4 esquinas: fondo izq. → der. → frente der. → izq. (' + tracking.corners.length + '/4)' :
                    tracking.mode === 'lost' ? 'Referencia perdida · recalibra' : 'Mapa sin calibrar'}
              </span>
            </div>
            {tracking.alignmentError && (
              <Notice instance="cola-grid-alignment-error" variant="warning">{tracking.alignmentError}</Notice>
            )}
            <p className="text-xs text-zinc-500">
              {tracking.seenIds.length} posiciones observadas en cámara, no contadas. Cada pila requiere confirmación.
            </p>
          </div>
        )}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-zinc-950">
          {scanning ? (
            <>
              <video ref={videoRef} muted autoPlay playsInline aria-label="Cámara para revisar la pila"
                className="absolute inset-0 h-full w-full object-cover" />
              <canvas ref={overlayRef} width={W} height={H}
                onPointerUp={tracking.onPointerUp}
                className={'absolute inset-0 h-full w-full touch-manipulation ' +
                  (tracking.mode === 'tracking' || tracking.mode === 'calibrating' ? 'cursor-crosshair' : 'pointer-events-none')} />
              <span className="absolute bottom-2 left-2 rounded bg-black/75 px-2 py-1 text-xs text-white">
                {hint === null ? 'Sin pista fiable; confirma con los botones' :
                  'Pista: ' + (hint >= 4 ? '4 o más' : hint) + ' visibles (verificar)'}
              </span>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center text-white">
              <Camera className="h-8 w-8" />
              <p className="text-sm">Apunta lateralmente a una sola pila para distinguir las latas.</p>
            </div>
          )}
        </div>
        {error && <Notice instance="cola-assisted-camera-error" variant="negative">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button instance="cola-assisted-toggle" variant="secondary"
            onClick={() => { setError(null); setHint(null); history.current = []; tracking.reset(); setScanning(value => !value) }}>
            {scanning ? 'Detener cámara' : 'Abrir cámara'}
          </Button>
          {hint !== null && (
            <Button instance="cola-assisted-suggestion" variant="tertiary"
              onClick={() => confirm(hint, 'confirmed-suggestion')}>
              Confirmar pista: {hint >= 4 ? '4+' : hint}
            </Button>
          )}
        </div>
        {current && <p className="text-sm text-emerald-700">
          Posición guardada: {current.count >= 4 ? '4 o más' : current.count} latas.
        </p>}
        <p className="text-sm font-semibold">¿Cuántas latas hay en esta pila?</p>
        <div className="grid grid-cols-5 gap-1">
          {[0, 1, 2, 3, 4].map(n => (
            <Button key={n} instance={'cola-assisted-answer-' + n}
              variant={current?.count === n ? 'primary' : 'secondary'}
              layout="fill" onClick={() => confirm(n, 'manual')}>
              {n === 4 ? '4+' : String(n)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          «4+» incluye la quinta lata sobrante; no genera cantidades negativas.
          Las sugerencias visuales requieren confirmación, pues no se observan las latas ocultas.
        </p>
      </Surface>
      <Surface instance="cola-assisted-totals" variant="block" className="flex flex-col gap-3 p-3">
        <h2 className="text-base font-semibold">Reposición acumulada</h2>
        {([
          ['Coca-Cola', original], ['Coca-Cola Zero', zero],
        ] as const).map(([name, result]) => (
          <div key={name} className="flex justify-between gap-2 border-b border-zinc-100 pb-2">
            <div>
              <p className="text-sm font-medium">{name}</p>
              <p className="text-xs text-zinc-500">{result.confirmed}/{result.positions} pilas · {result.present} latas verificadas</p>
            </div>
            <div className="text-right">
              <strong className="text-xl tabular-nums">
                {result.totalMissing === null ? '—' : result.totalMissing}
              </strong>
              <p className="text-xs text-zinc-500">
                {result.totalMissing === null ? result.confirmedMissing + ' faltan en las revisadas' : 'para reponer'}
              </p>
            </div>
          </div>
        ))}
        {totals.totalMissing === null ? (
          <Notice instance="cola-assisted-incomplete" variant="warning">
            Quedan {totals.positions - totals.confirmed} pilas sin revisar. Faltan
            {' '}{totals.confirmedMissing} latas en las revisadas; todavía no es el total definitivo.
          </Notice>
        ) : <p className="text-sm font-semibold text-emerald-700">
          Total para reponer: {totals.totalMissing} latas.
        </p>}
        {confirmReset ? (
          <div className="flex flex-wrap gap-2">
            <Button instance="cola-assisted-reset-confirm" variant="destructive"
              onClick={() => { setCounts({}); choose(allPositions[0].id); setConfirmReset(false) }}>
              Vaciar recuento
            </Button>
            <Button instance="cola-assisted-reset-cancel" variant="secondary"
              onClick={() => setConfirmReset(false)}>Cancelar</Button>
          </div>
        ) : (
          <Button instance="cola-assisted-reset" variant="tertiary" onClick={() => setConfirmReset(true)}>
            Nuevo recuento
          </Button>
        )}
      </Surface>
    </div>
  )
}
