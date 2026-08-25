import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findOption } from './allowed-values.ts';
import type { PropertyValues, StudioElement } from './types.ts';

const BLUEPRINT_REL = 'marbella-os/2-diseno/BLUEPRINT-VISUAL.md';

export function blueprintPath(repoRoot = process.cwd()): string {
    return join(repoRoot, BLUEPRINT_REL);
}

function decisionBlock(element: StudioElement, values: PropertyValues, when: string): string {
    const lines = element.properties.map((property) => {
        const chosen = values[property.id] ?? property.actualId;
        const option = findOption(property.options, chosen);
        return `- ${property.label}: ${option?.label ?? chosen}`;
    });
    return [
        ``,
        `### Decisión congelada: ${element.label} (${when})`,
        ``,
        `CANON CERRADO. Contrato obligatorio del código.`,
        `Los consumidores que no cumplen este contrato deben migrarse;`,
        `no se permite crear excepciones locales.`,
        ``,
        ...lines,
        ``,
    ].join('\n');
}

export function applyBlueprintStatus(
    markdown: string,
    element: StudioElement,
    values: PropertyValues,
    when = new Date().toISOString().slice(0, 10)
): { ok: true; next: string } | { ok: false; reason: string } {
    let next = markdown;

    if (element.blueprintNeedle) {
        if (!markdown.includes(element.blueprintNeedle)) {
            return {
                ok: false,
                reason: 'El Blueprint no contiene la fila esperada. No se modifica a ciegas.',
            };
        }
        if (element.blueprintNeedle.includes('BORRADOR / PROPUESTA')) {
            next = next.replaceAll(
                element.blueprintNeedle,
                element.blueprintNeedle.replace('BORRADOR / PROPUESTA', 'CANON CERRADO')
            );
        }
    } else {
        const row = `| ${element.label} | CANON CERRADO |`;
        if (!next.includes(row)) {
            const anchor = '| Field (contrato completo) |';
            const idx = next.indexOf(anchor);
            if (idx === -1) {
                return { ok: false, reason: 'No hay ancla en la matriz para insertar la fila.' };
            }
            const lineStart = next.lastIndexOf('\n', idx) + 1;
            next = `${next.slice(0, lineStart)}${row}\n${next.slice(lineStart)}`;
        }
    }

    if (!next.includes(`### Decisión congelada: ${element.label}`)) {
        const parte10 = next.indexOf('## Parte 10');
        const insertAt = parte10 === -1 ? next.length : parte10;
        next = `${next.slice(0, insertAt)}${decisionBlock(element, values, when)}\n${next.slice(insertAt)}`;
    }

    return { ok: true, next };
}

export function writeBlueprint(
    element: StudioElement,
    values: PropertyValues,
    repoRoot = process.cwd()
): { ok: true } | { ok: false; reason: string } {
    const path = blueprintPath(repoRoot);
    const current = readFileSync(path, 'utf8');
    const result = applyBlueprintStatus(current, element, values);
    if (!result.ok) return result;
    writeFileSync(path, result.next);
    return { ok: true };
}
