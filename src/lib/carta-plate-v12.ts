import type { PlatoMarbellaSlot } from './carta-plato-marbella'
import plateV12Layout from './carta-plate-v12-layout.json'

export const PLATE_V12_CANVAS = {
  width: plateV12Layout.canvas[0],
  height: plateV12Layout.canvas[1],
} as const
export const PLATE_V12_BASE_PATH = '/images/carta/plato-marbella/v12'

export type PlateV12AssetKey =
  | 'carbonara'
  | 'crema'
  | 'ensalada'
  | 'gazpacho'
  | 'pesto'
  | 'revuelto'
  | 'berenjena'
  | 'caballa'
  | 'calamares'
  | 'contramuslo'
  | 'entrana'
  | 'pollo'
  | 'roastbeef'
  | 'patatas'
  | 'verduras'

export type PlateV12Transform = {
  scale: number
  x: number
  y: number
}

export type PlateV12HitBox = {
  left: number
  top: number
  width: number
  height: number
}

export const PLATE_V12_BOWL_STARTERS = new Set<PlateV12AssetKey>([
  'carbonara',
  'crema',
  'ensalada',
  'gazpacho',
  'pesto',
  'revuelto',
])

export const PLATE_V12_TRANSFORMS = plateV12Layout.assets as Readonly<
  Record<PlateV12AssetKey | 'bowl_group', PlateV12Transform>
>

/**
 * Cajas de interacción medidas sobre los assets V12 ya transformados.
 * Solo afectan al hit-area; no intervienen en la composición visual.
 */
export const PLATE_V12_HITBOXES: Readonly<Record<PlateV12AssetKey, PlateV12HitBox>> = {
  carbonara: { left: 11.6, top: 21.8, width: 36.9, height: 34.3 },
  crema: { left: 11.6, top: 21.8, width: 36.9, height: 34.3 },
  ensalada: { left: 11.6, top: 21.8, width: 36.9, height: 34.3 },
  gazpacho: { left: 11.6, top: 21.8, width: 36.9, height: 34.3 },
  pesto: { left: 11.6, top: 21.8, width: 36.9, height: 34.3 },
  revuelto: { left: 11.6, top: 21.8, width: 36.9, height: 34.3 },
  berenjena: { left: 12.5, top: 26.9, width: 38.5, height: 28.0 },
  caballa: { left: 50.3, top: 25.7, width: 34.2, height: 33.6 },
  calamares: { left: 48.9, top: 25.8, width: 32.5, height: 37.5 },
  contramuslo: { left: 47.8, top: 29.2, width: 36.2, height: 31.2 },
  entrana: { left: 48.5, top: 24.5, width: 32.2, height: 40.5 },
  pollo: { left: 48.1, top: 28.0, width: 33.5, height: 34.3 },
  roastbeef: { left: 48.6, top: 24.0, width: 32.2, height: 41.5 },
  patatas: { left: 30.7, top: 53.3, width: 32.4, height: 21.9 },
  verduras: { left: 29.8, top: 52.7, width: 33.3, height: 23.9 },
}

const ARTICLE_ASSET: Readonly<Record<number, PlateV12AssetKey>> = {
  138: 'berenjena',
  141: 'pesto',
  142: 'carbonara',
  144: 'caballa',
  145: 'entrana',
  146: 'calamares',
  147: 'pollo',
  189: 'roastbeef',
  191: 'ensalada',
  197: 'verduras',
  203: 'patatas',
  204: 'revuelto',
  207: 'crema',
  211: 'contramuslo',
}

const DEFAULT_HITBOX_BY_SLOT: Readonly<Record<PlatoMarbellaSlot, PlateV12HitBox>> = {
  entrante: { left: 12, top: 22, width: 38, height: 34 },
  principal: { left: 48, top: 24, width: 36, height: 41 },
  guarnicion: { left: 30, top: 53, width: 34, height: 24 },
}

const DEFAULT_LABEL_POS_BY_SLOT: Readonly<Record<PlatoMarbellaSlot, { left: number; top: number }>> = {
  entrante: { left: 30, top: 34 },
  principal: { left: 66, top: 43 },
  guarnicion: { left: 47, top: 68 },
}

function foldLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function resolvePlateV12Asset(input: {
  id?: string
  label: string
  slot: PlatoMarbellaSlot
}): PlateV12AssetKey | null {
  const id = Number(input.id)
  if (Number.isFinite(id) && ARTICLE_ASSET[id]) return ARTICLE_ASSET[id]!

  const label = foldLabel(input.label)
  if (/\b(gazpacho|gaspatxo)\b/.test(label)) return 'gazpacho'
  if (/\bcarbonara\b/.test(label)) return 'carbonara'
  if (/\bpesto\b/.test(label)) return 'pesto'
  if (/\b(crema|sopa crema)\b/.test(label)) return 'crema'
  if (/\b(ensalada|amanida).*\b(atun|tonyina)\b/.test(label)) return 'ensalada'
  if (/\b(revuelto|remenat).*\b(champinon|bolet|bolets|xampinyo|xampinyons)\b/.test(label)) return 'revuelto'
  if (/\b(berenjena|albergina)\b/.test(label)) return 'berenjena'
  if (/\b(contramuslo|contramusle)\b/.test(label)) return 'contramuslo'
  if (/\b(roast ?beef)\b/.test(label)) return 'roastbeef'
  if (/\b(entrana|entraña)\b/.test(label)) return 'entrana'
  if (/\b(caballa|verat)\b/.test(label)) return 'caballa'
  if (/\b(calamar|calamares|calamarsons?)\b/.test(label)) return 'calamares'
  if (/\b(pollo|pollastre)\b/.test(label)) return 'pollo'
  if (/\b(patata|patatas|patates|panadera)\b/.test(label)) return 'patatas'
  if (/\b(verdura|verduras|verdures)\b/.test(label)) return 'verduras'
  return null
}

export function plateV12AssetPath(key: PlateV12AssetKey): string {
  if (PLATE_V12_BOWL_STARTERS.has(key) || key === 'berenjena') {
    return `${PLATE_V12_BASE_PATH}/entrantes/${key}.png`
  }
  if (key === 'patatas' || key === 'verduras') {
    return `${PLATE_V12_BASE_PATH}/guarniciones/${key}.png`
  }
  return `${PLATE_V12_BASE_PATH}/principales/${key}.png`
}

export function plateV12HitBox(key: PlateV12AssetKey | null, slot: PlatoMarbellaSlot): PlateV12HitBox {
  return key ? PLATE_V12_HITBOXES[key] : DEFAULT_HITBOX_BY_SLOT[slot]
}

export function plateV12LabelPosition(slot: PlatoMarbellaSlot): { left: number; top: number } {
  return DEFAULT_LABEL_POS_BY_SLOT[slot]
}
