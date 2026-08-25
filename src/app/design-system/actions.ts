'use server';

import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { auditElement } from '@/lib/design-system/canon/audit';
import { loadRegistry, loadStudioSnapshot } from '@/lib/design-system/canon/io';
import { promoteToCanon } from '@/lib/design-system/canon/promote';
import { discardProposal, saveProposal } from '@/lib/design-system/canon/save-proposal';
import { actualValues, getHydratedElement } from '@/lib/design-system/visual-studio/catalog';
import { gateCanonDecision, gateProposalValues } from '@/lib/design-system/visual-studio/decision';
import { readGitHistory } from '@/lib/design-system/visual-studio/git-history';
import { measureImpact } from '@/lib/design-system/visual-studio/impact';
import type { CanonDecisionInput, PropertyValues } from '@/lib/design-system/visual-studio/types';

async function gateMaster(): Promise<{ ok: true } | { ok: false; message: string }> {
    const supabase = await createClient();
    const sessionResult = await supabase.auth.getSession();
    const email = sessionResult.data.session?.user?.email ?? '';
    if (!isMasterDashboardUser(email)) {
        return { ok: false, message: 'Solo master puede usar el estudio visual.' };
    }
    return { ok: true };
}

function liveElement(elementId: string) {
    const registry = loadRegistry();
    return getHydratedElement(elementId, registry.elements);
}

export async function loadStudioState() {
    const gate = await gateMaster();
    if (!gate.ok) return { ok: false as const, message: gate.message };
    return { ok: true as const, snapshot: loadStudioSnapshot() };
}

export async function previewCanonImpact(elementId: string) {
    const gate = await gateMaster();
    if (!gate.ok) return { ok: false as const, message: gate.message };
    const element = liveElement(elementId);
    if (!element) return { ok: false as const, message: 'Elemento desconocido.' };
    const audit = auditElement(element);
    return {
        ok: true as const,
        impact: measureImpact(elementId),
        audit,
        applyKind: element.applyKind,
        status: element.status,
    };
}

export async function saveStudioProposal(input: {
    elementId: string;
    lane: 'a' | 'b';
    values: PropertyValues;
}) {
    const gate = await gateMaster();
    if (!gate.ok) return { ok: false as const, message: gate.message };
    const element = liveElement(input.elementId);
    if (!element) return { ok: false as const, message: 'Elemento desconocido.' };
    const proposalGate = gateProposalValues(element, input.values);
    if (!proposalGate.ok) return { ok: false as const, message: proposalGate.reason };
    const saved = saveProposal({
        elementId: input.elementId,
        lane: input.lane,
        values: input.values,
        element,
    });
    if (!saved.ok) return { ok: false as const, message: saved.reason };
    return { ok: true as const, snapshot: loadStudioSnapshot() };
}

export async function discardStudioProposal(elementId: string, lane?: 'a' | 'b') {
    const gate = await gateMaster();
    if (!gate.ok) return { ok: false as const, message: gate.message };
    discardProposal(elementId, lane);
    return { ok: true as const, snapshot: loadStudioSnapshot() };
}

export async function confirmCanonDecision(input: CanonDecisionInput) {
    const gate = await gateMaster();
    if (!gate.ok) return { ok: false as const, message: gate.message };
    const element = liveElement(input.elementId);
    if (!element) return { ok: false as const, message: 'Elemento desconocido.' };
    const merged = { ...actualValues(element), ...input.values };
    const decisionGate = gateCanonDecision(element, merged, {
        allowRevisionProposal: input.isRevision === true,
    });
    if (!decisionGate.ok) return { ok: false as const, message: decisionGate.reason };
    const audit = auditElement(element);
    return {
        ok: true as const,
        impact: measureImpact(input.elementId),
        audit,
        applyKind: element.applyKind,
        status: element.status,
    };
}

export async function saveAsCanon(input: CanonDecisionInput) {
    const gate = await gateMaster();
    if (!gate.ok) {
        return {
            ok: false as const,
            message: gate.message,
            blueprintUpdated: false,
            sourcesUpdated: [] as string[],
            remainingDebt: [] as string[],
        };
    }
    return promoteToCanon({
        elementId: input.elementId,
        values: input.values,
        isRevision: input.isRevision,
        runTests: true,
    });
}

export async function loadElementHistory(elementId: string) {
    const gate = await gateMaster();
    if (!gate.ok) return { ok: false as const, message: gate.message, entries: [] };
    const element = liveElement(elementId);
    if (!element) return { ok: false as const, message: 'Elemento desconocido.', entries: [] };
    const registry = loadRegistry();
    const git = await readGitHistory([
        'src/lib/design-system/canon/registry.json',
        'marbella-os/2-diseno/BLUEPRINT-VISUAL.md',
        ...element.sourceFiles,
    ]);
    return {
        ok: true as const,
        entries: git,
        canonHistory: registry.history.filter((entry) => entry.elementId === elementId),
    };
}

export async function auditStudioElement(elementId: string) {
    const gate = await gateMaster();
    if (!gate.ok) return { ok: false as const, message: gate.message };
    const element = liveElement(elementId);
    if (!element) return { ok: false as const, message: 'Elemento desconocido.' };
    return { ok: true as const, audit: auditElement(element), impact: measureImpact(elementId) };
}
