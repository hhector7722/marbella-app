import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cssVarFn, findOption, MODAL_HEADER_HEIGHT_OPTIONS, tokenById } from './allowed-values.ts';
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

    const fills: Array<{
        key: string;
        variant: 'primary' | 'secondary' | 'tertiary' | 'destructive';
    }> = [
        { key: 'fill-primary', variant: 'primary' },
        { key: 'fill-secondary', variant: 'secondary' },
        { key: 'fill-tertiary', variant: 'tertiary' },
        { key: 'fill-destructive', variant: 'destructive' },
    ];
    for (const { key, variant } of fills) {
        const fill = cssVarFn(values[key] ?? '');
        if (!fill) continue;
        const patched = patchButtonVariantFill(next, variant, fill);
        if (patched) next = patched;
    }

    return next;
}

function patchButtonVariantFill(
    css: string,
    variant: 'primary' | 'secondary' | 'tertiary' | 'destructive',
    fill: string
): string | null {
    let next = css;
    if (variant === 'tertiary') {
        const color = replaceRule(next, "[data-component='Button'][data-variant='tertiary'] {", (body) =>
            setDecl(body, 'color', fill)
        );
        if (color) next = color;
        const before = replaceRule(
            next,
            "[data-component='Button'][data-variant='tertiary']::before {",
            (body) => {
                let out = setDecl(body, 'background-color', 'transparent');
                out = setDecl(out, 'border-color', `color-mix(in srgb, ${fill} 20%, transparent)`);
                return out;
            }
        );
        if (before) next = before;
        const hover = replaceRule(
            next,
            "[data-component='Button'][data-variant='tertiary']:hover:not(:disabled)::before {",
            (body) => setDecl(body, 'background-color', `color-mix(in srgb, ${fill} 10%, transparent)`)
        );
        if (hover) next = hover;
        return next;
    }

    const before = replaceRule(
        next,
        `[data-component='Button'][data-variant='${variant}']::before {`,
        (body) => {
            let out = setDecl(body, 'background-color', fill);
            out = setDecl(out, 'border-color', fill);
            return out;
        }
    );
    if (before) next = before;
    const hover = replaceRule(
        next,
        `[data-component='Button'][data-variant='${variant}']:hover:not(:disabled)::before {`,
        (body) => {
            const mixed = `color-mix(in srgb, ${fill} 82%, var(--color-texto-fuerte))`;
            let out = setDecl(body, 'background-color', mixed);
            out = setDecl(out, 'border-color', mixed);
            return out;
        }
    );
    if (hover) next = hover;
    return next;
}

function setCssVarDecl(css: string, varName: string, value: string): string | null {
    const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${escaped}:\\s*)[^;]+`);
    if (!re.test(css)) return null;
    return css.replace(re, `$1${value}`);
}

function modalHeightCss(id: string): string | null {
    const option = findOption(MODAL_HEADER_HEIGHT_OPTIONS, id);
    if (!option) return null;
    if (option.cssVar) return `var(${option.cssVar})`;
    return option.value;
}

function patchModalHeader(css: string, values: Record<string, string>): string | null {
    const height = modalHeightCss(values.height ?? 'estructura.cabecera-modal');
    const inset = cssVarFn(values.inset ?? 'espacio.4');
    const alignX = values['align-x'] ?? 'left';
    if (!height || !inset) return null;

    let next = setCssVarDecl(css, '--modal-header-height', height);
    if (next === null) return null;
    const inseted = setCssVarDecl(next, '--modal-header-inset', inset);
    if (inseted) next = inseted;

    const heading = replaceRule(next, "[data-component='Modal'] [data-element='heading'] {", (body) =>
        setDecl(body, 'justify-content', justifyFromAlignX(alignX === 'edges' ? 'left' : alignX))
    );
    if (heading) next = heading;
    return next;
}

function removeDecl(body: string, property: string): string {
    return body.replace(new RegExp(`\\s*${property}:\\s*[^;]+;`, 'g'), '');
}

function patchPageHeader(css: string, values: Record<string, string>): string | null {
    const px = cssVarFn(values.px ?? '');
    const py = cssVarFn(values.py ?? '');
    const alignX = values['align-x'];
    const alignY = values['align-y'];
    const title = tokenById(values['title-size'] ?? '');
    const heightId = values.height ?? 'auto';
    const height = heightId === 'auto' ? null : cssVarFn(heightId);
    if (!px || !py || !alignX || !alignY) return null;
    if (heightId !== 'auto' && !height) return null;

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
            if (height) {
                out = setDecl(out, 'box-sizing', 'border-box');
                out = setDecl(out, '--page-header-height', height);
                out = setDecl(
                    out,
                    '--page-header-scale',
                    'calc(var(--page-header-height) / var(--tactil-minimo))'
                );
                out = setDecl(out, 'height', height);
                out = setDecl(out, 'min-height', height);
                out = setDecl(out, 'max-height', height);
                out = setDecl(out, 'padding-block', '0');
            } else {
                out = removeDecl(out, 'box-sizing');
                out = removeDecl(out, '--page-header-height');
                out = setDecl(out, '--page-header-scale', '1');
                out = removeDecl(out, 'height');
                out = removeDecl(out, 'min-height');
                out = removeDecl(out, 'max-height');
                out = setDecl(out, 'padding-block', py);
            }
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
    else if (element.id === 'modal-header') next = patchModalHeader(css, values);
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
