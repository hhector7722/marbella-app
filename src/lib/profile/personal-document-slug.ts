/**
 * Slug del nombre de empleado para localizar la imagen de su documento en
 * `/public/personal/`.
 *
 * Formato de archivo: `<slug>-delantera.<ext>` y opcionalmente `<slug>-trasera.<ext>`.
 * El slug se compone de primer nombre, segundo nombre (si existe) y primer apellido,
 * en minúsculas, sin acentos y con guiones entre palabras.
 *
 * Ejemplos:
 *   "Hector", "Sanchez"           -> hector-sanchez
 *   "Fernando Ariel", "Gutierrez" -> fernando-ariel-gutierrez
 */
export function personalDocumentSlug(firstName: string, lastName: string | null | undefined): string {
    const first = normalizeSlugPart(firstName);
    const last = normalizeSlugPart(lastName);
    const firstApellido = last.split('-')[0] || '';
    return [first, firstApellido].filter(Boolean).join('-');
}

/** La parte "delantera" o "trasera" del nombre del archivo. */
export type PersonalDocumentSide = 'delantera' | 'trasera';

export function personalDocumentFilePattern(slug: string): { base: string; side: PersonalDocumentSide }[] {
    return [
        { base: `${slug}-delantera`, side: 'delantera' },
        { base: `${slug}-trasera`, side: 'trasera' },
    ];
}

export const PERSONAL_DOCUMENT_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

function normalizeSlugPart(value: string | null | undefined): string {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}