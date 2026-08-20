/**
 * Detección de padding estructural en el hijo raíz del Body de Modal.
 * El shell ya aplica inset horizontal + gap Header→Body; un `p-4`/`px-6`
 * en el root child duplica el inset (auditoría Block 0).
 *
 * No corrige consumidores: solo clasifica classNames y fuentes.
 */

/** Padding de escala ≥4 (16px) o arbitrario grande: choca con inset contractual. */
const ROOT_PADDING_TOKEN_RE =
    /^(?:sm:|md:|lg:|xl:|2xl:)?(?:p|px|py|pt|pb|pl|pr|ps|pe)-(?:[4-9]|[1-9]\d|\[(?!0(?:px|rem|em)?\]).+\])$/;

export function hasForbiddenModalRootPaddingToken(token: string): boolean {
    return ROOT_PADDING_TOKEN_RE.test(token);
}

export function hasForbiddenModalRootPaddingClassName(
    className: string | undefined
): boolean {
    if (!className) return false;
    return className.split(/\s+/).some(hasForbiddenModalRootPaddingToken);
}

/**
 * Extrae literales de className del primer hijo elemento tras cada `<Modal …>`.
 * Heurística de fuente (TSX), no AST: suficiente para gate de regresión.
 */
export function findModalRootPaddingClassNames(source: string): string[] {
    const found: string[] = [];
    const modalRe = /<Modal\b/g;
    let match: RegExpExecArray | null;
    while ((match = modalRe.exec(source)) !== null) {
        const openEnd = findJsxOpenTagEnd(source, match.index);
        if (openEnd < 0) continue;
        if (source.slice(match.index, openEnd + 1).endsWith('/>')) continue;
        const after = source.slice(openEnd + 1, openEnd + 1 + 800);
        const child = after.match(
            /^\s*<(?:div|section|form|main|article)\b([^>]*)>/
        );
        if (!child) continue;
        const cls = extractClassNameLiterals(child[1] ?? '');
        if (cls && hasForbiddenModalRootPaddingClassName(cls)) {
            found.push(cls);
        }
    }
    return found;
}

function findJsxOpenTagEnd(source: string, start: number): number {
    let i = start;
    let quote: string | null = null;
    let brace = 0;
    while (i < source.length) {
        const c = source[i];
        if (quote) {
            if (c === quote && source[i - 1] !== '\\') quote = null;
            i += 1;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            quote = c;
            i += 1;
            continue;
        }
        if (c === '{') brace += 1;
        else if (c === '}') brace -= 1;
        else if (c === '>' && brace === 0) return i;
        i += 1;
    }
    return -1;
}

function extractClassNameLiterals(tagAttrs: string): string | null {
    const m = tagAttrs.match(
        /\bclassName\s*=\s*(?:\{([^}]*(?:\{[^}]*\}[^}]*)*)\}|"([^"]*)"|'([^']*)')/
    );
    if (!m) return null;
    if (m[2] != null) return m[2];
    if (m[3] != null) return m[3];
    const expr = m[1] ?? '';
    const lits = [...expr.matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
    return lits.length > 0 ? lits.join(' ') : null;
}
