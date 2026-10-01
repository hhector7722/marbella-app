function normalizeLabel(value: string): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

const AMETLLER_PREFIX = /^(?:[A-Z]\d{3}[A-Z]\d{6}|[A-Z]\d{6}[A-Z]\d{2}[A-Z]|[A-Z]\d{10}|[A-Z]\d{9}|[A-Z]\d{8}|[A-Z]\d{6})\s*/i
const AMETLLER_ARTICLE_BEFORE_TECHNICAL_PREFIX = /^\d{3,6}\s+(?=[A-Z]\d)/i

/**
 * Ametller concatena en algunos documentos un código técnico delante de la
 * descripción (a veces sin espacio). Ese código no identifica la presentación
 * económica y puede cambiar entre documentos, así que no forma parte de la
 * clave estable del producto del proveedor.
 */
export function stripSupplierTechnicalPrefix(value: string, supplierId: number): string {
  const raw = String(value ?? '').trim()
  if (supplierId !== 1) return raw
  const withoutArticleCode = raw.replace(AMETLLER_ARTICLE_BEFORE_TECHNICAL_PREFIX, '').trim()
  const stripped = withoutArticleCode.replace(AMETLLER_PREFIX, '').trim()
  return stripped || raw
}

export function canonicalSupplierItemKey(value: string, supplierId: number): string {
  const normalized = normalizeLabel(stripSupplierTechnicalPrefix(value, supplierId))
  // Ametller concatena con frecuencia palabras que en otros albaranes vienen
  // separadas ("CebollaGorda" / "Cebolla Gorda", "AtunAceite" / "Atun Aceite").
  // Tras retirar el código técnico, los espacios no forman parte de la
  // identidad estable de ese proveedor.
  return supplierId === 1 ? normalized.replace(/\s+/g, '') : normalized
}
