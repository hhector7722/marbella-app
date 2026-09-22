/**
 * Borrador del recuento de inventario.
 *
 * Persiste en el dispositivo (localStorage) para que las cantidades contadas no
 * se pierdan al salir de la pantalla o cerrar la aplicación. Se restablece solo
 * cuando el recuento se guarda correctamente (`clearInventoryDraft`).
 *
 * El borrador es por usuario y vive en el dispositivo: no viaja al servidor ni
 * se comparte entre dispositivos hasta que se guarda. Ver DEUDA D30.
 */

export type InventoryDraft = {
  physicalCountsBarra: Record<string, string>
  numericByIdBarra: Record<string, number>
  physicalCountsCamara: Record<string, string>
  numericByIdCamara: Record<string, number>
}

export const EMPTY_INVENTORY_DRAFT: InventoryDraft = {
  physicalCountsBarra: {},
  numericByIdBarra: {},
  physicalCountsCamara: {},
  numericByIdCamara: {},
}

export function inventoryDraftKey(userId: string): string {
  return `inventory_count_draft_${userId}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toRawMap(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string' && raw.trim() !== '') out[key] = raw
  }
  return out
}

function toNumericMap(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value)) {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(n) && n >= 0) out[key] = n
  }
  return out
}

export function hasInventoryDraftContent(draft: InventoryDraft): boolean {
  return (
    Object.keys(draft.physicalCountsBarra).length > 0 ||
    Object.keys(draft.numericByIdBarra).length > 0 ||
    Object.keys(draft.physicalCountsCamara).length > 0 ||
    Object.keys(draft.numericByIdCamara).length > 0
  )
}

export function readInventoryDraft(userId: string | null | undefined): InventoryDraft | null {
  if (!userId || typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(inventoryDraftKey(userId))
    if (!stored) return null
    const parsed = JSON.parse(stored) as unknown
    if (!isPlainObject(parsed)) return null
    return {
      physicalCountsBarra: toRawMap(parsed.physicalCountsBarra),
      numericByIdBarra: toNumericMap(parsed.numericByIdBarra),
      physicalCountsCamara: toRawMap(parsed.physicalCountsCamara),
      numericByIdCamara: toNumericMap(parsed.numericByIdCamara),
    }
  } catch {
    return null
  }
}

export function writeInventoryDraft(
  userId: string | null | undefined,
  draft: InventoryDraft
): void {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(inventoryDraftKey(userId), JSON.stringify(draft))
  } catch {
    // localStorage lleno o bloqueado: el recuento sigue funcionando sin borrador.
  }
}

export function clearInventoryDraft(userId: string | null | undefined): void {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(inventoryDraftKey(userId))
  } catch {
    // no-op
  }
}
