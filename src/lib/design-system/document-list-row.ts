/**
 * Contrato de DocumentListRow — fila canónica de documento (perfil).
 *
 * Familia: Nóminas / Comunicados / Contrato.
 * No es ListRow genérico. No es Button. No es SelectionOption.
 */

export const DOCUMENT_LIST_ROW_COMPONENT_ID = 'DocumentListRow' as const;

/**
 * Huella del patrón ad hoc previo a DocumentListRow.
 * Si aparece fuera del host oficial, es regresión o deuda nueva.
 */
export const DOCUMENT_LIST_ROW_LEGACY_FINGERPRINT =
    'flex-1 min-w-0 flex items-center gap-3 px-4 py-3 rounded-xl text-left';
