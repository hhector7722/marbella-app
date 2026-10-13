/**
 * Filas administrativas que el OCR puede incluir por error entre productos.
 * La lista es deliberadamente estrecha: nunca descartar una línea que tenga
 * código de producto o magnitudes económicas, aunque el texto coincida.
 * No elimina la evidencia original almacenada en document_extractions.
 */
export type AdministrativeRowEvidence = {
  name: string | null | undefined
  supplierProductCode?: string | null
  quantity?: number | string | null
  unitPrice?: number | string | null
  total?: number | string | null
  netUnitPrice?: number | string | null
  discount?: number | string | null
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase()
}

export function isAdministrativeNonProductRow(evidence: AdministrativeRowEvidence): boolean {
  const label = normalized(String(evidence.name ?? ''))
  const administrative = /^TANCAT$/.test(label)
    || /^NO HI HA DINERS$/.test(label)
    || /^FILTEMP\.?\s*\/\s*RECOLLIDA$/.test(label)
    // OCR de capturas de pantalla: botones, teclas y rótulos fiscales
    // aislados nunca son artículos si carecen de toda evidencia económica.
    || /^(?:←|→|ESC|FNLOCAL|F[1-5]|2%|21%|ENVASES:\s*0)$/.test(label)
  if (!administrative) return false
  return ![
    evidence.supplierProductCode,
    evidence.quantity,
    evidence.unitPrice,
    evidence.total,
    evidence.netUnitPrice,
    evidence.discount,
  ].some((value) => value != null && String(value).trim() !== '')
}
