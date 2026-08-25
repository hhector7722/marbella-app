import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cssVarFn, tokenById } from './allowed-values.ts';
import type { StudioElement } from './types.ts';

const CSS_REL = 'src/app/globals.css';

export type CssApplyResult =
    | { ok: true; path: string; unchanged?: boolean }
    | { ok: false; reason: string };

function replaceRule(
    css: string,
    header: string,
    mutator: (body: string) => string | null
): string | null {
    const start = css.indexOf(header);
    if (start < 0) return null;
    const open = css.indexOf('{', start);
    if (open < 0) return null;
    const close = css.indexOf('}', open);
    if (close < 0) return null;
    const body = css.slice(open + 1, close);
    const nextBody = mutator(body);
    if (nextBody === null) return null;
    return `${css.slice(0, open + 1)}${nextBody}${css.slice(close)}`;
}

function setDecl(body: string, property: string, value: string): string {
    const re = new RegExp(`(\\s${property}:\\s*)[^;]+`);
    if (re.test(body)) return body.replace(re, `$1${value}`);
    const trimmed = body.replace(/\n\s*$/, '');
    return `${trimmed}\n    ${property}: ${value};\n  `;
}

function justifyFromAlignX(id: string): string {
    if (id === 'left') return 'flex-start';
    if (id === 'center') return 'center';
    return 'space-between';
}

function alignFromAlignY(id: string): string {
    if (id === 'top') return 'flex-start';
    if (id === 'bottom') return 'flex-end';
    return 'center';
}

function textAlignFromAlignX(id: string): string {
    return id === 'center' ? 'center' : 'start';
}

function patchField(css: string, values: Record<string, string>): string | null {
    const height = cssVarFn(values.height ?? '');
    const radius = cssVarFn(values.radius ?? '');
    const px = cssVarFn(values.px ?? '');
    const gap = cssVarFn(values['label-gap'] ?? '');
    const focus = cssVarFn(values.focus ?? '');
    if (!height || !radius || !px) return null;

    let next = replaceRule(
        css,
        "[data-component='Field'] [data-element='control'] input,",
        (body) => {
            let out = body;
            out = setDecl(out, 'min-height', height);
            out = setDecl(out, 'padding-inline', px);
            out = setDecl(out, 'border-radius', radius);
            return out;
        }
    );
    if (next === null) return null;

    if (gap) {
        const gapped = replaceRule(
            next,
            "[data-component='Field'] [data-element='control'] {",
            (body) => setDecl(body, 'margin-top', gap)
        );
        if (gapped) next = gapped;
    }

    if (focus) {
        const focused = replaceRule(
            next,
            "[data-component='Field'] [data-element='control'] input:focus,",
            (body) => {
                let out = setDecl(body, 'border-color', focus);
                out = setDecl(
                    out,
                    'outline',
                    `2px solid color-mix(in srgb, ${focus} 25%, transparent)`
                );
                return out;
            }
        );
        if (focused) next = focused;
    }

    return next;
}

function patchEmpty(css: string, values: Record<string, string>): string | null {
    const alignX = values['align-x'];
    const padY = cssVarFn(values['pad-y'] ?? '') ?? 'var(--espacio-8)';
    const gap = cssVarFn(values.gap ?? '');
    if (alignX !== 'left' && alignX !== 'center' && alignX !== 'edges') return null;

    let next = replaceRule(css, "[data-component='EmptyState'] {", (body) => {
        let out = setDecl(body, 'text-align', textAlignFromAlignX(alignX));
        if (/padding:/.test(out) && !/padding-block:/.test(out)) {
            out = setDecl(out, 'padding', `${padY} var(--espacio-4)`);
        } else {
            out = setDecl(out, 'padding-block', padY);
        }
        return out;
    });
    if (next === null) return null;

    if (gap) {
        const gapped = replaceRule(
            next,
            "[data-component='EmptyState'] [data-element='description'] {",
            (body) => setDecl(body, 'margin', `${gap} 0 0`)
        );
        if (gapped) next = gapped;
    }
    return next;
}

function patchButton(css: string, values: Record<string, string>): string | null {
    const height = cssVarFn(values.height ?? '');
    const radius = cssVarFn(values.radius ?? '');
    const px = cssVarFn(values.px ?? '');
    const alignX = values['align-x'] ?? 'center';
    if (!height || !radius || !px) return null;

    let next = replaceRule(css, "[data-component='Button'] {", (body) => {
        let out = body;
        out = setDecl(out, 'height', height);
        out = setDecl(out, 'min-height', height);
        out = setDecl(out, 'max-height', height);
        out = setDecl(out, 'padding-inline', px);
        out = setDecl(out, 'border-radius', radius);
        out = setDecl(out, 'justify-content', justifyFromAlignX(alignX === 'edges' ? 'center' : alignX));
        return out;
    });
    if (next === null) return null;

    const icon = replaceRule(next, "[data-component='Button'][data-icon-only='true'] {", (body) => {
        let out = setDecl(body, 'width', height);
        out = setDecl(out, 'min-width', height);
        return out;
    });
    if (icon) next = icon;

    const before = replaceRule(next, "[data-component='Button']::before {", (body) =>
        setDecl(body, 'border-radius', radius)
    );
    if (before) next = before;

    return next;
}

function patchPageHeader(css: string, values: Record<string, string>): string | null {
    const px = cssVarFn(values.px ?? '');
    const py = cssVarFn(values.py ?? '');
    const alignX = values['align-x'];
    const alignY = values['align-y'];
    const title = tokenById(values['title-size'] ?? '');
    if (!px || !py || !alignX || !alignY) return null;

    let next = replaceRule(
        css,
        "[data-component='PageScreen'] [data-element='header'],",
        (body) => {
            let out = body;
            out = setDecl(out, 'display', 'flex');
            out = setDecl(out, 'align-items', alignFromAlignY(alignY));
            out = setDecl(out, 'justify-content', justifyFromAlignX(alignX));
            if (!/gap:/.test(out)) {
                out = setDecl(out, 'gap', 'var(--espacio-3)');
            }
            out = setDecl(out, 'padding-inline', px);
            out = setDecl(out, 'padding-block', py);
            return out;
        }
    );
    if (next === null) return null;

    if (title?.value) {
        const titled = replaceRule(
            next,
            "[data-component='PageScreen'] [data-element='title'],",
            (body) => setDecl(body, 'font-size', title.value)
        );
        if (titled) next = titled;
    }
    return next;
}

export function applyCssContract(
    element: StudioElement,
    values: Record<string, string>,
    repoRoot = process.cwd()
): CssApplyResult {
    if (element.applyKind !== 'css-contract') {
        return { ok: false, reason: 'Esta pieza no tiene contrato CSS centralizado.' };
    }

    const path = join(repoRoot, CSS_REL);
    const css = readFileSync(path, 'utf8');
    let next: string | null = null;

    if (element.id === 'field') next = patchField(css, values);
    else if (element.id === 'empty-state') next = patchEmpty(css, values);
    else if (element.id === 'button') next = patchButton(css, values);
    else if (element.id === 'page-header') next = patchPageHeader(css, values);
    else {
        return { ok: false, reason: `No hay escritor CSS para «${element.label}».` };
    }

    if (next === null) {
        return { ok: false, reason: `No se encontró el bloque CSS de ${element.label}.` };
    }

    if (next === css) {
        return { ok: true, path: CSS_REL, unchanged: true };
    }

    writeFileSync(path, next);
    return { ok: true, path: CSS_REL };
}
