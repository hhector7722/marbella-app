import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { actualValues, getHydratedElement } from '../visual-studio/catalog.ts';
import { applyCssContract } from '../visual-studio/css-apply.ts';
import { describeChanges, freezeableElement, gateCanonDecision } from '../visual-studio/decision.ts';
import { canWriteCanon } from '../visual-studio/git-history.ts';
import { measureImpact } from '../visual-studio/impact.ts';
import type { ApplyResult, PropertyValues } from '../visual-studio/types.ts';
import { auditElement } from './audit.ts';
import { loadProposals, loadRegistry, writeProposals, writeRegistry } from './io.ts';
import { renderBlueprint } from './render-blueprint.ts';
import type { CanonHistoryEntry } from './schema.ts';

const execFileAsync = promisify(execFile);

function stamp(): string {
    return new Date().toISOString().slice(0, 10);
}

function fail(message: string): ApplyResult {
    return {
        ok: false,
        message,
        blueprintUpdated: false,
        sourcesUpdated: [],
        remainingDebt: [],
    };
}

export async function promoteToCanon(input: {
    elementId: string;
    values: PropertyValues;
    isRevision?: boolean;
    repoRoot?: string;
    runTests?: boolean;
}): Promise<ApplyResult> {
    const root = input.repoRoot ?? process.cwd();
    const writable = canWriteCanon(root);
    if (!writable.ok) return fail(writable.reason ?? 'No se puede escribir.');

    const registry = loadRegistry(root);
    const element = getHydratedElement(input.elementId, registry.elements);
    if (!element) return fail('Elemento desconocido.');

    const freezeable = freezeableElement(input.elementId, input.isRevision === true, registry.elements);
    if (!freezeable) {
        return fail('Este elemento no es congelable. Si está cerrado, usa Proponer revisión.');
    }

    const merged = { ...actualValues(element), ...input.values };
    const gate = gateCanonDecision(element, merged, {
        allowRevisionProposal: input.isRevision === true,
    });
    if (!gate.ok) return fail(gate.reason);

    const sourcesUpdated: string[] = [];
    if (element.applyKind === 'css-contract') {
        const css = applyCssContract(element, merged, root);
        if (!css.ok) return fail(css.reason);
        sourcesUpdated.push(css.path);
    }

    const previous = registry.elements[element.id];
    const version = (previous?.version ?? 0) + 1;
    const changes = describeChanges(element, merged);
    const entry: CanonHistoryEntry = {
        at: stamp(),
        elementId: element.id,
        fromStatus: element.status,
        toStatus: 'CANON CERRADO',
        version,
        changes,
        kind: input.isRevision ? 'revision' : 'freeze',
    };

    const nextRegistry = {
        ...registry,
        updatedAt: new Date().toISOString(),
        elements: {
            ...registry.elements,
            [element.id]: {
                status: 'CANON CERRADO' as const,
                version,
                properties: { ...(previous?.properties ?? {}), ...merged },
                ...(previous?.inherits ? { inherits: previous.inherits } : {}),
            },
        },
        history: [...registry.history, entry],
    };
    writeRegistry(nextRegistry, root);
    sourcesUpdated.unshift('src/lib/design-system/canon/registry.json');

    const blueprint = renderBlueprint(nextRegistry);
    writeFileSync(join(root, 'marbella-os/2-diseno/BLUEPRINT-VISUAL.md'), blueprint);
    sourcesUpdated.push('marbella-os/2-diseno/BLUEPRINT-VISUAL.md');

    const proposals = loadProposals(root);
    if (proposals[element.id]) {
        delete proposals[element.id];
        writeProposals(proposals, root);
        sourcesUpdated.push('src/lib/design-system/canon/proposals.json');
    }

    const impact = measureImpact(element.id, root);
    const audit = auditElement(element, root);
    const remainingDebt = audit.pending.map((hit) => `${hit.file}: ${hit.reason}`);

    let testOutput: string | undefined;
    if (input.runTests) {
        try {
            const { stdout, stderr } = await execFileAsync('npm', ['run', 'test:design-system'], {
                cwd: root,
                timeout: 120000,
            });
            testOutput = `${stdout}\n${stderr}`.trim();
        } catch (error) {
            const err = error as { stdout?: string; stderr?: string; message?: string };
            testOutput = `${err.stdout ?? ''}\n${err.stderr ?? err.message ?? ''}`.trim();
        }
    }

    const cssNote =
        element.applyKind === 'locked'
            ? ' Contrato bloqueado: el registro y el Blueprint se actualizaron; el CSS de la primitiva no se reescribe.'
            : element.applyKind === 'blueprint-only'
              ? ' No hay componente único que reescribir. La migración de consumidores es deuda.'
              : '';

    return {
        ok: true,
        message: `${element.label} es CANON CERRADO (v${version}). ${
            impact.undetermined
                ? 'Impacto no determinado.'
                : `${audit.conforming} conformes, ${audit.pending.length} pendientes.`
        }${cssNote}`,
        blueprintUpdated: true,
        sourcesUpdated,
        remainingDebt,
        testOutput,
    };
}
