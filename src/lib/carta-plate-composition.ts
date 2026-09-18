import type { PlatoMarbellaSlot } from './carta-plato-marbella.ts'

/** Cómo se sirve el alimento sobre la vajilla. Independiente del tramo de elección. */
export type PlateFoodKind = 'bowl' | 'main' | 'side'

export type PlateFoodVisual = {
  type?: PlateFoodKind
  /** Escala percibida respecto al asiento del layout. */
  scale?: number
  /** Desplazamiento horizontal extra, en % del propio recuadro. */
  x?: number
  /** Desplazamiento vertical extra, en % del propio recuadro. */
  y?: number
  rotate?: number
}

export type PlateFoodInput = {
  slot: PlatoMarbellaSlot
  id?: string
  label: string
}

export type PlateFoodPlacement = {
  slot: PlatoMarbellaSlot
  kind: PlateFoodKind
  left: number
  top: number
  width: number
  height: number
  z: number
  scale: number
  x: number
  y: number
  rotate: number
}

type Seat = {
  kind: PlateFoodKind
  cx: number
  cy: number
  w: number
  h: number
  z: number
  rotate: number
}

const KIND_ORDER: PlateFoodKind[] = ['bowl', 'main', 'side']

/** Zona segura del hueco: nada opaco puede salir de este recuadro (%). */
export const PLATE_SAFE_MIN = 12
export const PLATE_SAFE_MAX = 88

/**
 * Ajustes por artículo real del Plat Marbella.
 * El tipo visual no tiene por qué coincidir con el tramo (p. ej. berenjena es principal).
 * Escala < 1: no se rellena el círculo; se sirve una ración sobre vajilla blanca.
 */
const VISUAL_BY_ARTICULO: Readonly<Record<number, PlateFoodVisual>> = {
  141: { type: 'bowl', scale: 0.86, rotate: -4 }, // Pasta al pesto
  142: { type: 'bowl', scale: 0.86, rotate: -3 }, // Pasta carbonara
  207: { type: 'bowl', scale: 0.84 }, // Crema
  191: { type: 'bowl', scale: 0.88 }, // Ensalada de atún
  204: { type: 'bowl', scale: 0.86 }, // Revuelto con champiñones
  138: { type: 'main', scale: 0.88, rotate: 4 }, // Berenjena a la parmesana
  145: { type: 'main', scale: 0.9, rotate: 5 }, // Entraña
  147: { type: 'main', scale: 0.88, rotate: 3 }, // Pollo
  146: { type: 'main', scale: 0.78, rotate: -3 }, // Calamares
  211: { type: 'main', scale: 0.88, rotate: 3 }, // Contramuslo
  189: { type: 'main', scale: 0.88, rotate: 4 }, // Roastbeef
  144: { type: 'main', scale: 0.86, rotate: -3 }, // Caballa
  203: { type: 'side', scale: 0.86 }, // Patatas panadera
  197: { type: 'side', scale: 0.76 }, // Verduras al horno
}

const BOWL_NAME =
  /\b(pasta|pesto|carbonara|crema|sopa|ensalada|amanida|risotto|revuelto|gazpacho)\b/i
const SIDE_NAME = /\b(patata|patatas|potato|verdura|verduras|panadera|guarnici[oó]n)\b/i
const MAIN_NAME =
  /\b(pollo|pollastre|calamar|calamares|entrecot|entra[nñ]a|brinsa|roast|verat|caballa|berenjena|albergina|carne|pescado|peix|muslo|musle|contramuslo|contramusle)\b/i

function seat(
  kind: PlateFoodKind,
  cx: number,
  cy: number,
  w: number,
  h: number,
  z: number,
  rotate = 0,
): Seat {
  return { kind, cx, cy, w, h, z, rotate }
}

/** Layouts en % del hueco. Asientos pequeños: queda vajilla blanca entre raciones. */
const LAYOUTS: Readonly<Record<string, readonly Seat[]>> = {
  bowl: [seat('bowl', 50, 44, 36, 36, 2)],
  main: [seat('main', 50, 46, 36, 34, 3)],
  side: [seat('side', 50, 52, 38, 32, 4)],

  'bowl+bowl': [
    seat('bowl', 34, 44, 34, 34, 2, -4),
    seat('bowl', 66, 44, 34, 34, 3, 4),
  ],
  'bowl+main': [
    seat('bowl', 33, 38, 34, 34, 2, -4),
    seat('main', 67, 46, 34, 32, 3, 4),
  ],
  'bowl+side': [
    seat('bowl', 50, 34, 34, 34, 2),
    seat('side', 50, 70, 36, 30, 4),
  ],
  'main+main': [
    seat('main', 34, 46, 34, 32, 2, -4),
    seat('main', 66, 46, 34, 32, 3, 4),
  ],
  'main+side': [
    seat('main', 62, 36, 34, 32, 3, 3),
    seat('side', 38, 70, 36, 30, 4, -2),
  ],
  'side+side': [
    seat('side', 34, 52, 34, 30, 3, -3),
    seat('side', 66, 52, 34, 30, 4, 3),
  ],

  'bowl+main+side': [
    seat('bowl', 33, 34, 34, 34, 2, -4),
    seat('main', 67, 34, 34, 32, 3, 4),
    seat('side', 50, 70, 36, 30, 4),
  ],
  'bowl+main+main': [
    seat('bowl', 50, 32, 32, 32, 2),
    seat('main', 32, 68, 32, 30, 3, -4),
    seat('main', 68, 68, 32, 30, 4, 4),
  ],
  'bowl+side+side': [
    seat('bowl', 50, 32, 32, 32, 2),
    seat('side', 32, 70, 32, 28, 3, -3),
    seat('side', 68, 70, 32, 28, 4, 3),
  ],
  'main+main+side': [
    seat('main', 32, 34, 32, 30, 2, -4),
    seat('main', 68, 34, 32, 30, 3, 4),
    seat('side', 50, 70, 36, 30, 4),
  ],
  'main+side+side': [
    seat('main', 50, 32, 34, 32, 2),
    seat('side', 32, 70, 32, 28, 3, -3),
    seat('side', 68, 70, 32, 28, 4, 3),
  ],
  'main+main+main': [
    seat('main', 50, 32, 32, 30, 2),
    seat('main', 32, 70, 32, 30, 3, -4),
    seat('main', 68, 70, 32, 30, 4, 4),
  ],
  'bowl+bowl+side': [
    seat('bowl', 32, 32, 32, 32, 2, -4),
    seat('bowl', 68, 32, 32, 32, 3, 4),
    seat('side', 50, 70, 36, 30, 4),
  ],
  'bowl+bowl+main': [
    seat('bowl', 32, 32, 32, 32, 2, -4),
    seat('bowl', 68, 32, 32, 32, 3, 4),
    seat('main', 50, 70, 34, 30, 4),
  ],
  'bowl+bowl+bowl': [
    seat('bowl', 50, 32, 32, 32, 2),
    seat('bowl', 32, 70, 32, 32, 3, -4),
    seat('bowl', 68, 70, 32, 32, 4, 4),
  ],
}

function foldLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function plateFoodSignature(kinds: readonly PlateFoodKind[]): string {
  const counts: Record<PlateFoodKind, number> = { bowl: 0, main: 0, side: 0 }
  for (const kind of kinds) counts[kind] += 1
  const parts: PlateFoodKind[] = []
  for (const kind of KIND_ORDER) {
    for (let i = 0; i < counts[kind]; i++) parts.push(kind)
  }
  return parts.join('+')
}

function articuloIdOf(id: string | undefined): number | null {
  if (!id) return null
  const n = Number(id)
  return Number.isFinite(n) ? n : null
}

export function visualForPlateFood(input: PlateFoodInput): PlateFoodVisual {
  const articuloId = articuloIdOf(input.id)
  if (articuloId != null && VISUAL_BY_ARTICULO[articuloId]) {
    return VISUAL_BY_ARTICULO[articuloId]!
  }
  return {}
}

export function classifyPlateFood(input: PlateFoodInput): PlateFoodKind {
  const visual = visualForPlateFood(input)
  if (visual.type) return visual.type

  const name = foldLabel(input.label)
  if (BOWL_NAME.test(name)) return 'bowl'
  if (SIDE_NAME.test(name)) return 'side'
  if (MAIN_NAME.test(name)) return 'main'

  if (input.slot === 'guarnicion') return 'side'
  if (input.slot === 'principal') return 'main'
  return 'bowl'
}

function fallbackSeats(kinds: readonly PlateFoodKind[]): Seat[] {
  const anchors = [
    { cx: 50, cy: 28 },
    { cx: 28, cy: 66 },
    { cx: 72, cy: 66 },
  ] as const
  return kinds.map((kind, i) => {
    const a = anchors[Math.min(i, anchors.length - 1)]!
    const size = kind === 'bowl' ? 34 : 32
    return seat(kind, a.cx, a.cy, size, size, i + 2)
  })
}

function seatsFor(kinds: readonly PlateFoodKind[]): Seat[] {
  const key = plateFoodSignature(kinds)
  const listed = LAYOUTS[key]
  if (listed && listed.length === kinds.length) return [...listed]
  return fallbackSeats(kinds)
}

function boxFromSeat(seatSpec: Seat): Pick<PlateFoodPlacement, 'left' | 'top' | 'width' | 'height' | 'z' | 'rotate'> {
  return {
    left: seatSpec.cx - seatSpec.w / 2,
    top: seatSpec.cy - seatSpec.h / 2,
    width: seatSpec.w,
    height: seatSpec.h,
    z: seatSpec.z,
    rotate: seatSpec.rotate,
  }
}

/** Recuadro visible tras escala, giro y empujón. Coordenadas en % del hueco. */
export function plateFoodVisualBox(p: PlateFoodPlacement): {
  left: number
  top: number
  right: number
  bottom: number
} {
  const rad = (p.rotate * Math.PI) / 180
  const vw = p.width * p.scale
  const vh = p.height * p.scale
  const cx = p.left + p.width / 2 + (p.width * p.x) / 100
  const cy = p.top + p.height / 2 + (p.height * p.y) / 100
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const aw = vw * cos + vh * sin
  const ah = vw * sin + vh * cos
  return {
    left: cx - aw / 2,
    top: cy - ah / 2,
    right: cx + aw / 2,
    bottom: cy + ah / 2,
  }
}

const SAFE_SPAN = PLATE_SAFE_MAX - PLATE_SAFE_MIN

function fitPlacementInSafeArea(p: PlateFoodPlacement): PlateFoodPlacement {
  let next = { ...p }
  for (let i = 0; i < 8; i++) {
    const box = plateFoodVisualBox(next)
    const bw = box.right - box.left
    const bh = box.bottom - box.top
    if (bw > SAFE_SPAN || bh > SAFE_SPAN) {
      const factor = Math.min(SAFE_SPAN / Math.max(bw, 0.001), SAFE_SPAN / Math.max(bh, 0.001)) * 0.98
      next = { ...next, scale: next.scale * factor }
      continue
    }
    let left = next.left
    let top = next.top
    if (box.left < PLATE_SAFE_MIN) left += PLATE_SAFE_MIN - box.left
    if (box.top < PLATE_SAFE_MIN) top += PLATE_SAFE_MIN - box.top
    if (box.right > PLATE_SAFE_MAX) left -= box.right - PLATE_SAFE_MAX
    if (box.bottom > PLATE_SAFE_MAX) top -= box.bottom - PLATE_SAFE_MAX
    if (left === next.left && top === next.top) return next
    next = { ...next, left, top }
  }
  return next
}

function defaultKindForSlot(slot: PlatoMarbellaSlot): PlateFoodKind {
  if (slot === 'guarnicion') return 'side'
  if (slot === 'principal') return 'main'
  return 'bowl'
}

const SLOT_ORDER: PlatoMarbellaSlot[] = ['entrante', 'principal', 'guarnicion']

/**
 * Coloca las raciones según su tipo visual, no según el orden de elección.
 * Misma terna de alimentos → misma composición.
 * Los asientos vacíos se reservan con el tipo por defecto del tramo, para que
 * un bol no salte al añadir la carne.
 */
export function placePlateFoods(inputs: readonly PlateFoodInput[]): PlateFoodPlacement[] {
  const present = inputs.filter((item) => item.label)
  if (present.length === 0) return []

  const classified = present.map((item) => {
    const visual = visualForPlateFood(item)
    const kind = classifyPlateFood(item)
    return { item, kind, visual }
  })

  const presentBySlot = new Map(classified.map((row) => [row.item.slot, row]))
  const layoutKinds: PlateFoodKind[] = SLOT_ORDER.map((slot) => {
    const row = presentBySlot.get(slot)
    return row ? row.kind : defaultKindForSlot(slot)
  })
  const seats = seatsFor(layoutKinds)
  const used = new Set<number>()
  const placed: PlateFoodPlacement[] = []

  const byKind: Record<PlateFoodKind, typeof classified> = {
    bowl: [],
    main: [],
    side: [],
  }
  for (const row of classified) byKind[row.kind].push(row)
  for (const kind of KIND_ORDER) {
    byKind[kind].sort((a, b) => {
      const ia = articuloIdOf(a.item.id) ?? 0
      const ib = articuloIdOf(b.item.id) ?? 0
      if (ia !== ib) return ia - ib
      return a.item.label.localeCompare(b.item.label, 'es')
    })
  }

  for (const kind of KIND_ORDER) {
    const rows = byKind[kind]
    const kindSeats = seats
      .map((spec, index) => ({ spec, index }))
      .filter((entry) => entry.spec.kind === kind && !used.has(entry.index))
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      const entry = kindSeats[i]
      if (!entry) continue
      used.add(entry.index)
      const box = boxFromSeat(entry.spec)
      const visual = row.visual
      placed.push(
        fitPlacementInSafeArea({
          slot: row.item.slot,
          kind: row.kind,
          ...box,
          rotate: box.rotate + (visual.rotate ?? 0),
          scale: visual.scale ?? 0.9,
          x: visual.x ?? 0,
          y: visual.y ?? 0,
        }),
      )
    }
  }

  return placed.sort((a, b) => a.z - b.z)
}
