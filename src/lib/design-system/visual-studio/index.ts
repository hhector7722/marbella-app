export type { CanonStatus, ImpactReport, StudioElement } from './types.ts';
export { CANON_STATUSES } from './types.ts';
export {
    STUDIO_ELEMENTS,
    actualValues,
    elementsByGroup,
    getHydratedElement,
    getStudioElement,
    hydrateElements,
    isIndependentVisualCanon,
    HEADER_DERIVED_ID,
    HEADER_PRIMARY_IDS,
    HEADER_SPECIALIZED_IDS,
    studioNavId,
} from './catalog.ts';
export { COLOR_OPTIONS, findOption } from './allowed-values.ts';
export { measureImpact } from './impact.ts';
export { describeChanges, gateCanonDecision, gateProposalValues } from './decision.ts';
export { applyCanonDecision, summarizeDecision } from './apply.ts';
export { readGitHistory } from './git-history.ts';
export { applyBlueprintStatus } from './blueprint-apply.ts';
