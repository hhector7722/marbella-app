/**
 * Detector de `<button>` nativo que son CTAs de negocio claros.
 * No es allowlist de rutas: clasifica por copy/aria + exclusiones estructurales.
 * Gate: el conteo de CTAs claros debe permanecer en 0 tras Block 1B.
 */

const BUSINESS_LABEL_RE =
    /\b(guardar|eliminar|editar|cancelar|confirmar|crear|enviar|aplicar|limpiar|continuar|listo|añadir|agregar|nuevo|nueva|borrar|corregir|seleccionar|desseleccionar|vincular|mapear|auto-mapear|reintentar|sincronizar|exportar|importar|descargar|duplicar|aceptar|rechazar)\b/i;

const SHORT_ACTION_RE =
    /^(ver|abrir|cerrar|volver|salir|entrar|filtrar|buscar)\b/i;

/** Controles que NO son CTA de negocio aislado (chrome / widget / lista). */
const STRUCTURAL_EXCLUSION_RE =
    /añadir una unidad|quitar una unidad|añadir uno|seleccionar mes|volver al calendario|cerrar menú|ver foto ampliada|ver más|filtrar food cost|ver mis propinas|abrir detalle de ingredientes|aria-expanded|aspect-square|data-modal-close|modal-header-height|min-w-ds-tactil|h-\[18px\]/i;

/** Icon-only de chrome (X / ←) con label genérico. */
const CHROME_ICON_LABEL_RE = /^(cerrar|volver)$/i;

/** Hosts con contrato propio (no migrar a Button genérico en esta oleada). */
const SPECIALIZED_HOST_RE =
    /TimeFilterButton\.tsx$|CartaSubcategoryPickerModalShell\.tsx$|ConsumptionBottomSheet\.tsx$|QuickCalculatorModal\.tsx$/;

export function isClearBusinessNativeButtonLabel(
    text: string,
    ariaOrTitle = ''
): boolean {
    const s = (text || ariaOrTitle || '').trim();
    if (!s) return false;
    if (STRUCTURAL_EXCLUSION_RE.test(s)) return false;
    if (BUSINESS_LABEL_RE.test(s) && s.length < 80) return true;
    if (SHORT_ACTION_RE.test(s) && s.length < 50) return true;
    return false;
}

export type NativeBusinessHit = {
    line: number;
    label: string;
};

export function isSpecializedButtonHostPath(filePath: string): boolean {
    return SPECIALIZED_HOST_RE.test(filePath.replace(/\\/g, '/'));
}

/**
 * Extrae CTAs de negocio claros en un fuente TSX.
 * El caller debe omitir `button.tsx`, `modal.tsx` y playground.
 */
export function findClearBusinessNativeButtons(source: string): NativeBusinessHit[] {
    const hits: NativeBusinessHit[] = [];
    const re = /<button\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
        const info = extractButton(source, m.index);
        if (!info) continue;
        const blob = info.openTag + info.body + info.label;
        if (STRUCTURAL_EXCLUSION_RE.test(blob)) continue;
        if (!info.hasText && !info.aria) continue;
        const label = info.text || info.aria || info.title;
        // Chrome icon-only Cerrar/Volver
        if (
            !info.hasText &&
            CHROME_ICON_LABEL_RE.test(label) &&
            /<[A-Z]|<svg\b/.test(info.body)
        ) {
            continue;
        }
        if (!isClearBusinessNativeButtonLabel(info.text, info.aria || info.title)) {
            continue;
        }
        if (/w-full[^"']*text-left|text-left[^"']*w-full/.test(info.openTag)) continue;
        hits.push({ line: info.line, label });
    }
    return hits;
}

function extractButton(src: string, index: number) {
    let i = index;
    let quote: string | null = null;
    let brace = 0;
    let openEnd = -1;
    while (i < src.length) {
        const c = src[i];
        if (quote) {
            if (c === quote && src[i - 1] !== '\\') quote = null;
            i++;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            quote = c;
            i++;
            continue;
        }
        if (c === '{') brace++;
        else if (c === '}') brace--;
        else if (c === '>' && brace === 0) {
            openEnd = i;
            break;
        }
        i++;
    }
    if (openEnd < 0) return null;
    const openTag = src.slice(index, openEnd + 1);
    const aria =
        openTag.match(/aria-label=\{?["'`]([^"'`]+)["'`]/)?.[1] ||
        openTag.match(/aria-label=\{`([^`]+)`\}/)?.[1] ||
        '';
    const title = openTag.match(/title=\{?["'`]([^"'`]+)["'`]/)?.[1] || '';
    let body = '';
    let j = openEnd + 1;
    let depth = 1;
    quote = null;
    brace = 0;
    while (j < src.length && depth > 0) {
        if (!quote && brace === 0) {
            if (src.startsWith('</button>', j)) {
                depth--;
                if (depth === 0) {
                    body = src.slice(openEnd + 1, j);
                    break;
                }
                j += 9;
                continue;
            }
            if (src.startsWith('<button', j)) {
                depth++;
                j += 7;
                continue;
            }
        }
        const c = src[j];
        if (quote) {
            if (c === quote && src[j - 1] !== '\\') quote = null;
            j++;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            quote = c;
            j++;
            continue;
        }
        if (c === '{') brace++;
        else if (c === '}') brace--;
        j++;
    }
    const text = body
        .replace(/\{[^}]*\?[^}]*:[^}]*\}/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\{[^}]+\}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
    return {
        openTag,
        body,
        text,
        aria,
        title,
        hasText: text.length > 0,
        label: text || aria || title,
        line: src.slice(0, index).split('\n').length,
    };
}
