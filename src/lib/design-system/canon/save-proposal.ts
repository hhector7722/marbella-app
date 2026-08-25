import { describeChanges, gateProposalValues } from '../visual-studio/decision.ts';
import type { PropertyValues, StudioElement } from '../visual-studio/types.ts';
import { loadProposals, writeProposals } from './io.ts';
import type { ProposalStore } from './schema.ts';

export function putProposal(
    store: ProposalStore,
    elementId: string,
    lane: 'a' | 'b',
    values: PropertyValues
): ProposalStore {
    const current = store[elementId] ?? {};
    return {
        ...store,
        [elementId]: {
            ...current,
            [lane]: {
                values,
                updatedAt: new Date().toISOString(),
            },
        },
    };
}

export function discardProposal(
    elementId: string,
    lane?: 'a' | 'b',
    repoRoot = process.cwd()
): void {
    const store = loadProposals(repoRoot);
    if (!store[elementId]) return;
    if (!lane) {
        delete store[elementId];
    } else {
        delete store[elementId][lane];
        if (!store[elementId].a && !store[elementId].b) delete store[elementId];
    }
    writeProposals(store, repoRoot);
}

export function saveProposal(input: {
    elementId: string;
    lane: 'a' | 'b';
    values: PropertyValues;
    element: StudioElement;
    repoRoot?: string;
}): { ok: true } | { ok: false; reason: string } {
    const gate = gateProposalValues(input.element, input.values);
    if (!gate.ok) return { ok: false, reason: gate.reason };
    const root = input.repoRoot ?? process.cwd();
    const next = putProposal(loadProposals(root), input.elementId, input.lane, input.values);
    writeProposals(next, root);
    return { ok: true };
}

export function proposalChanges(element: StudioElement, values: PropertyValues) {
    return describeChanges(element, values);
}
