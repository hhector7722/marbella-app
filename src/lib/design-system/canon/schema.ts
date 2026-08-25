import type { CanonStatus, PropertyValues } from '../visual-studio/types.ts';

export type CanonApplyKind =
    | 'css-contract'
    | 'blueprint-only'
    | 'locked'
    | 'unavailable';

export type CanonHistoryEntry = {
    at: string;
    elementId: string;
    fromStatus: CanonStatus;
    toStatus: CanonStatus;
    version: number;
    changes: Array<{ property: string; from: string; to: string }>;
    kind: 'freeze' | 'revision';
};

export type RegistryElement = {
    status: CanonStatus;
    version: number;
    properties: PropertyValues;
    /**
     * Referencia a otro elemento del registro cuyo contrato visual se reutiliza.
     * Un elemento con `inherits` no es un canon visual independiente.
     */
    inherits?: string;
};

export type CanonRegistry = {
    source: 'marbella-visual-canon';
    updatedAt: string;
    elements: Record<string, RegistryElement>;
    history: CanonHistoryEntry[];
};

export type ProposalLaneStore = {
    values: PropertyValues;
    updatedAt: string;
};

export type ProposalStore = Record<
    string,
    {
        a?: ProposalLaneStore;
        b?: ProposalLaneStore;
    }
>;

export type AuditHit = {
    file: string;
    reason: string;
};

export type AuditReport = {
    elementId: string;
    conforming: number;
    pending: AuditHit[];
};

export type StudioSnapshot = {
    registry: CanonRegistry;
    proposals: ProposalStore;
    writable: boolean;
    writableReason?: string;
};
