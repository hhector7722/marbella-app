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

/** Centros medidos sobre las cuatro fotografías originales, sin recortar. */
const fixedCenters: Record<Exclude<FloorplanZone,'individuales'>, Array<[string, number, number, FloorplanShape]>> = {
  alargadas: [
    ["al-1",13.151042,26.509186,"alargada"],
    ["al-2",36.328125,26.509186,"alargada"],
    ["al-3",60.611979,26.509186,"alargada"],
    ["al-4",85.286458,26.509186,"alargada"],
    ["al-5",13.151042,72.178478,"alargada"],
    ["al-6",36.328125,72.178478,"alargada"],
    ["al-7",60.611979,72.178478,"alargada"],
    ["al-8",85.286458,72.178478,"alargada"],
  ],
  terraza: [
    ["te-s-1",10.091146,18.372703,"cuadrada"],
    ["te-s-2",25.78125,18.372703,"cuadrada"],
    ["te-s-3",41.731771,18.372703,"cuadrada"],
    ["te-s-4",57.877604,18.372703,"cuadrada"],
    ["te-s-5",73.632813,18.372703,"cuadrada"],
    ["te-s-6",91.145833,18.372703,"cuadrada"],
    ["te-m-1",12.369792,40.682415,"cuadrada"],
    ["te-m-2",28.515625,40.682415,"cuadrada"],
    ["te-m-3",44.466146,40.682415,"cuadrada"],
    ["te-m-4",60.481771,40.682415,"cuadrada"],
    ["te-m-5",76.5625,40.682415,"cuadrada"],
    ["te-d-1",11.263021,72.965879,"doble"],
    ["te-d-2",27.213542,72.965879,"doble"],
    ["te-d-3",43.359375,72.965879,"doble"],
    ["te-d-4",59.505208,72.965879,"doble"],
    ["te-d-5",75.455729,72.965879,"doble"],
    ["te-d-6",91.861979,72.965879,"doble"],
  ],
  interior: [
    ["in-d-1",78.17029,13.043478,"doble"],
    ["in-d-2",78.17029,36.503623,"doble"],
    ["in-d-3",78.17029,59.692029,"doble"],
    ["in-b-1",19.474638,84.32971,"doble"],
    ["in-b-2",43.387681,84.32971,"cuadrada"],
    ["in-b-3",63.949275,84.32971,"cuadrada"],
  ],
}

export const INDIVIDUAL_SLOT_COUNT = 9
const individualSlots: Array<[number,number]> = [[19.69697,24.082935],[49.760766,24.082935],[79.984051,24.082935],[19.69697,49.920255],[49.760766,49.920255],[79.984051,49.920255],[19.69697,75.598086],[49.760766,75.598086],[79.984051,75.598086]]

function fixedTable(id:string,zone:FloorplanZone,number:number|null,x:number,y:number,shape:FloorplanShape):FloorplanTable {
  const width=zone==='interior'?(shape==='doble'?21:12):zone==='alargadas'?19:zone==='individuales'?21:11
  const height=zone==='interior'?20:zone==='alargadas'?39:zone==='individuales'?21:shape==='doble'?35:17
  return {
    id, zone, number,
    x:Math.max(0,Math.min(100-width,x-width/2)),
    y:Math.max(0,Math.min(100-height,y-height/2)),
    width,height,shape,rotation:0,
  }
}

export function fixedIndividualTable(slot:number,number:number|null):FloorplanTable {
  if(!Number.isSafeInteger(slot)||slot<0||slot>=individualSlots.length)throw new Error('Posición de mesa individual inválida.')
  const [x,y]=individualSlots[slot]
  return fixedTable('individual-'+slot,'individuales',number,x,y,'cuadrada')
}

export function initialFloorplanLayout(): FloorplanLayout {
  const tables:FloorplanTable[]=[]
  for(const zone of ['alargadas','terraza','interior'] as const){
    for(const [id,x,y,shape] of fixedCenters[zone]){
      tables.push(fixedTable(id,zone,null,x,y,shape))
    }
  }
  return {
    schema:1,
    salons:{alargadas:1,terraza:1,interior:null,individuales:null},
    tables,
  }
}

/** Nunca se publica una posición diferente de la marcada por la fotografía. */
export function hasFixedFloorplanGeometry(layout: FloorplanLayout): boolean {
  const defaults=initialFloorplanLayout().tables
  const originals=new Map(defaults.map(t=>[t.id,t]))
  const actual=new Map(layout.tables.map(t=>[t.id,t]))
  for(const [id,position] of originals){
    const current=actual.get(id)
    if(!current||!samePosition(current,position))return false
  }
  for(const current of layout.tables){
    if(originals.has(current.id))continue
    const match=/^individual-(\d{1,2})$/.exec(current.id)
    if(!match||Number(match[1])>=INDIVIDUAL_SLOT_COUNT||!samePosition(current,fixedIndividualTable(Number(match[1]),current.number)))return false
  }
  return actual.size===layout.tables.length
}
function samePosition(a:FloorplanTable,b:FloorplanTable):boolean {
  return a.id===b.id&&a.zone===b.zone&&a.x===b.x&&a.y===b.y&&
    a.width===b.width&&a.height===b.height&&a.shape===b.shape&&a.rotation===b.rotation
}

export function cloneFloorplan(layout: FloorplanLayout): FloorplanLayout {
  return {
    schema: 1,
    salons: { ...layout.salons },
    tables: layout.tables.map((item) => ({ ...item })),
  }
}

/** Reencaja las posiciones antiguas sin cambiar números, salones ni IDs. */
export function alignFloorplanToPhotos(layout: FloorplanLayout): FloorplanLayout {
  const positions = new Map(initialFloorplanLayout().tables.map(t => [t.id,t]))
  return {
    ...cloneFloorplan(layout),
    tables: layout.tables.map(t => {
      const fixed = positions.get(t.id)
      if (fixed && fixed.zone === t.zone) return {...fixed, number:t.number}
      const match = /^individual-(\d{1,2})$/.exec(t.id)
      if (t.zone === 'individuales' && match && Number(match[1]) < INDIVIDUAL_SLOT_COUNT) {
        return fixedIndividualTable(Number(match[1]),t.number)
      }
      return {...t}
    }),
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
