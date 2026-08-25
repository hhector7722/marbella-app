import { getHydratedElement, getStudioElement } from './catalog.ts';
import { describeChanges, gateCanonDecision } from './decision.ts';
import { loadRegistry } from '../canon/io.ts';
import { promoteToCanon } from '../canon/promote.ts';
import type { ApplyResult, CanonDecisionInput } from './types.ts';

export function summarizeDecision(input: CanonDecisionInput) {
    const registry = loadRegistry();
    const element = getHydratedElement(input.elementId, registry.elements) ?? getStudioElement(input.elementId);
    if (!element) return null;
    return {
        element,
        changes: describeChanges(element, input.values),
        gate: gateCanonDecision(element, input.values, {
            allowRevisionProposal: input.isRevision === true,
        }),
    };
}

export async function applyCanonDecision(
    input: CanonDecisionInput,
    repoRoot = process.cwd()
): Promise<ApplyResult> {
    return promoteToCanon({
        elementId: input.elementId,
        values: input.values,
        isRevision: input.isRevision,
        repoRoot,
        runTests: true,
    });
}
