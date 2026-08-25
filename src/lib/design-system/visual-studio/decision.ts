import { findOption } from './allowed-values.ts';
import { getHydratedElement, getStudioElement } from './catalog.ts';
import type { PropertyValues, StudioElement } from './types.ts';

export type DecisionGate =
    | { ok: true }
    | { ok: false; reason: string };

export function gateProposalValues(
    element: StudioElement,
    values: PropertyValues
): DecisionGate {
    if (element.applyKind === 'unavailable') {
        return {
            ok: false,
            reason: 'La alineación se congela en la pieza que la usa, no como token suelto.',
        };
    }
    if (element.status === 'DEPRECADO') {
        return { ok: false, reason: 'Un elemento deprecado no admite propuestas.' };
    }
    for (const property of element.properties) {
        const chosen = values[property.id];
        if (!chosen) continue;
        const option = findOption(property.options, chosen);
        if (!option) {
            return { ok: false, reason: `Valor no permitido en ${property.label}.` };
        }
    }
    return { ok: true };
}

export function gateCanonDecision(
    element: StudioElement,
    values: PropertyValues,
    opts?: { allowRevisionProposal?: boolean }
): DecisionGate {
    const proposing = opts?.allowRevisionProposal === true;
    if (element.status === 'CANON CERRADO' && !proposing) {
        return {
            ok: false,
            reason: 'Este elemento está en CANON CERRADO. No se edita. Usa Proponer revisión.',
        };
    }
    if (element.status === 'DEPRECADO' || element.status === 'ESPECIALIZADO' || element.status === 'HEREDADO') {
        return { ok: false, reason: 'Este elemento no se convierte en canon universal desde el estudio.' };
    }
    if (element.inherits) {
        return {
            ok: false,
            reason: `Hereda el contrato visual de ${element.inherits}. No se edita como canon independiente.`,
        };
    }
    if (element.redirectTo) {
        return { ok: false, reason: 'Esta entrada apunta a otro patrón. No es un contrato de cabecera.' };
    }
    if (element.promotePolicy === 'proposal-only') {
        return {
            ok: false,
            reason: 'Esta anatomía no tiene decisión canónica. Puedes proponer diseño; no se cierra como canon desde el estudio.',
        };
    }
    if (element.applyKind === 'unavailable') {
        return {
            ok: false,
            reason: 'La alineación se congela en la pieza que la usa (cabecera, Field, tabla), no como token suelto.',
        };
    }
    if (element.applyKind === 'locked' && !proposing) {
        return { ok: false, reason: 'Este contrato está bloqueado. Usa Proponer revisión.' };
    }
    for (const property of element.properties) {
        const chosen = values[property.id];
        if (!chosen) continue;
        const option = findOption(property.options, chosen);
        if (!option) {
            return { ok: false, reason: `Valor no permitido en ${property.label}.` };
        }
        if (option.requiresNewToken) {
            return {
                ok: false,
                reason: `Nuevo token requerido (${option.value}). No se crean tokens silenciosamente.`,
            };
        }
        if (option.blocksCanon) {
            return {
                ok: false,
                reason: `${property.label}: ${option.label} no puede ser canon. ${option.note ?? ''}`.trim(),
            };
        }
    }
    return { ok: true };
}

export function describeChanges(
    element: StudioElement,
    values: PropertyValues
): Array<{ property: string; from: string; to: string }> {
    const changes: Array<{ property: string; from: string; to: string }> = [];
    for (const property of element.properties) {
        const next = values[property.id];
        if (!next || next === property.actualId) continue;
        const from = findOption(property.options, property.actualId);
        const to = findOption(property.options, next);
        changes.push({
            property: property.label,
            from: from?.label ?? property.actualId,
            to: to?.label ?? next,
        });
    }
    return changes;
}

export function freezeableElement(
    id: string,
    isRevision = false,
    registryElements?: Record<string, { status: StudioElement['status']; properties: Record<string, string> }>
): StudioElement | undefined {
    const element = registryElements ? getHydratedElement(id, registryElements) : getStudioElement(id);
    if (!element) return undefined;
    if (element.applyKind === 'unavailable') return undefined;
    if (element.status === 'DEPRECADO' || element.status === 'ESPECIALIZADO' || element.status === 'HEREDADO') {
        return undefined;
    }
    if (element.inherits || element.redirectTo || element.promotePolicy === 'proposal-only') return undefined;
    if (element.status === 'CANON CERRADO') return isRevision ? element : undefined;
    if (element.status === 'BORRADOR / PROPUESTA' || element.status === 'SIN CANON') return element;
    return undefined;
}
