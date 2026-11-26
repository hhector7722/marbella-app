export const FLOORPLAN_ZONES = ['alargadas', 'terraza', 'interior', 'individuales'] as const

export type FloorplanZone = (typeof FLOORPLAN_ZONES)[number]
export type FloorplanShape = 'alargada' | 'cuadrada' | 'doble'
export type FloorplanRotation = 0 | 90 | 180 | 270

export type FloorplanTable = {
  id: string
  zone: FloorplanZone
  number: number | null
  x: number
  y: number
  width: number
  height: number
  rotation: FloorplanRotation
  shape: FloorplanShape
}

export type FloorplanLayout = {
  schema: 1
  salons: Record<FloorplanZone, number | null>
  tables: FloorplanTable[]
}

export type FloorplanRecord = {
  id: string
  draft: FloorplanLayout | null
  published: FloorplanLayout | null
  revision: number
  updated_at: string | null
}

export const ZONE_LABELS: Record<FloorplanZone, string> = {
  alargadas: 'Mesas alargadas',
  terraza: 'Terraza',
  interior: 'Interior',
  individuales: 'Individuales',
}

const table = (
  id: string, zone: FloorplanZone, x: number, y: number,
  width: number, height: number, shape: FloorplanShape,
  rotation: FloorplanRotation = 0,
): FloorplanTable => ({ id, zone, number: null, x, y, width, height, shape, rotation })

/**
 * Reproducción editable de los grupos de mesas de los dos planos aportados.
 * No se asignan números BDP de manera ficticia: la primera publicación exige
 * introducirlos todos. "Individuales" nace vacío para agregar mesas a voluntad.
 */
export function initialFloorplanLayout(): FloorplanLayout {
  const tables: FloorplanTable[] = []

  // Plano de terraza: bloque izquierdo, dos filas de cuatro alargadas.
  for (const [row, y] of [17, 56].entries()) {
    for (const [col, x] of [12, 33, 54, 75].entries()) {
      tables.push(table('al-' + (row * 4 + col + 1), 'alargadas', x, y, 12, 27, 'alargada'))
    }
  }

  // Terraza derecha: fila superior de seis cuadrados y fila intermedia
  // desplazada de cinco; fila inferior de seis parejas, como en el plano.
  for (const [i, x] of [5, 22, 39, 56, 73, 90].entries()) {
    tables.push(table('te-s-' + (i + 1), 'terraza', x, 11, 8, 16, 'cuadrada'))
  }
  for (const [i, x] of [13, 30, 47, 64, 81].entries()) {
    tables.push(table('te-m-' + (i + 1), 'terraza', x, 37, 8, 16, 'cuadrada'))
  }
  for (const [i, x] of [5, 22, 39, 56, 73, 90].entries()) {
    tables.push(table('te-d-' + (i + 1), 'terraza', x, 65, 8, 27, 'doble'))
  }

  // Plano interior: tres parejas verticales en el lateral derecho.
  for (const [i, y] of [10, 34, 58].entries()) {
    tables.push(table('in-d-' + (i + 1), 'interior', 72, y, 19, 19, 'doble', 90))
  }
  // Fila inferior: pareja izquierda y dos mesas individuales.
  tables.push(table('in-b-1', 'interior', 12, 78, 22, 14, 'doble', 90))
  tables.push(table('in-b-2', 'interior', 43, 78, 12, 14, 'cuadrada'))
  tables.push(table('in-b-3', 'interior', 62, 78, 12, 14, 'cuadrada'))

  return {
    schema: 1,
    // La única correspondencia confirmada por BDP es Terrassa = salón 1.
    // El salón interior y el de mesas sueltas se asignan en configuración.
    salons: { alargadas: 1, terraza: 1, interior: null, individuales: null },
    tables,
  }
}

export function cloneFloorplan(layout: FloorplanLayout): FloorplanLayout {
  return {
    schema: 1,
    salons: { ...layout.salons },
    tables: layout.tables.map((item) => ({ ...item })),
  }
}

const validZone = (value: unknown): value is FloorplanZone =>
  typeof value === 'string' && FLOORPLAN_ZONES.includes(value as FloorplanZone)

export function validateFloorplanLayout(raw: unknown, requireComplete: boolean): string[] {
  const errors: string[] = []
  if (!raw || typeof raw !== 'object') return ['El plano no tiene un formato válido.']
  const layout = raw as Partial<FloorplanLayout>
  if (layout.schema !== 1 || !layout.salons || !Array.isArray(layout.tables)) {
    return ['El plano no tiene un formato válido.']
  }
  if (layout.tables.length > 160) errors.push('El plano supera el límite de 160 mesas.')
  if (requireComplete && layout.tables.length === 0) errors.push('Añade al menos una mesa.')
  const seenIds = new Set<string>()
  const seenNumbers = new Set<string>()
  for (const z of FLOORPLAN_ZONES) {
    const salon = layout.salons[z]
    if (salon !== null && salon !== undefined && (!Number.isSafeInteger(salon) || salon < 1 || salon > 99)) {
      errors.push('El salón BDP de ' + ZONE_LABELS[z] + ' no es válido.')
    }
  }
  for (const [index, item] of layout.tables.entries()) {
    if (!item || typeof item !== 'object') { errors.push('Mesa inválida en posición ' + (index + 1)); continue }
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || seenIds.has(item.id)) {
      errors.push('Hay identificadores de mesa repetidos o incorrectos.')
    }
    seenIds.add(item.id)
    if (!validZone(item.zone)) { errors.push('Una mesa tiene una zona incorrecta.'); continue }
    if (!['alargada','cuadrada','doble'].includes(item.shape) || ![0,90,180,270].includes(item.rotation)) {
      errors.push('Una mesa tiene una forma u orientación incorrecta.')
    }
    for (const prop of ['x','y','width','height'] as const) {
      if (typeof item[prop] !== 'number' || !Number.isFinite(item[prop])) {
        errors.push('Una mesa tiene coordenadas incorrectas.')
      }
    }
    if (Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.width) && Number.isFinite(item.height)) {
      if (item.width < 4 || item.height < 4 || item.x < 0 || item.y < 0 ||
          item.x + item.width > 100.001 || item.y + item.height > 100.001) {
        errors.push('Hay mesas fuera de los límites de su zona.')
      }
    }
    const n = item.number
    const salon = layout.salons[item.zone]
    if (n === null || n === undefined) {
      if (requireComplete) errors.push('Falta numerar una o más mesas.')
      continue
    }
    if (!Number.isSafeInteger(n) || n < 1 || n > 9999) {
      errors.push('Cada mesa debe tener un número entero entre 1 y 9999.')
      continue
    }
    if (salon === null || salon === undefined) {
      if (requireComplete) errors.push('Configura el salón BDP de ' + ZONE_LABELS[item.zone] + '.')
      continue
    }
    const key = salon + ':' + n
    if (seenNumbers.has(key)) errors.push('El número ' + n + ' está duplicado en el salón BDP ' + salon + '.')
    seenNumbers.add(key)
  }
  return [...new Set(errors)]
}

export function nextAvailableNumber(layout: FloorplanLayout, zone: FloorplanZone): number {
  const salon = layout.salons[zone]
  const used = new Set(layout.tables.filter((t) => layout.salons[t.zone] === salon).map((t) => t.number))
  for (let i = 1; i <= 9999; i++) if (!used.has(i)) return i
  throw new Error('No hay números disponibles.')
}
