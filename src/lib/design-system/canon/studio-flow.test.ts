import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { auditElement } from './audit.ts';
import { emptyRegistry, loadProposals, loadRegistry, writeRegistry } from './io.ts';
import { promoteToCanon } from './promote.ts';
import { blueprintMatrixRow, renderBlueprint } from './render-blueprint.ts';
import { saveProposal } from './save-proposal.ts';
import { STUDIO_ELEMENTS, actualValues, getHydratedElement } from '../visual-studio/catalog.ts';
import { applyCssContract } from '../visual-studio/css-apply.ts';
import { gateCanonDecision, gateProposalValues } from '../visual-studio/decision.ts';
import { CANON_STATUSES } from '../visual-studio/types.ts';

const REPO = process.cwd();
const ACTIONS = join(REPO, 'src/app/design-system/actions.ts');

function fixtureRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'ds-studio-'));
    mkdirSync(join(dir, '.git'));
    mkdirSync(join(dir, 'src/app'), { recursive: true });
    mkdirSync(join(dir, 'src/lib/design-system/canon'), { recursive: true });
    mkdirSync(join(dir, 'src/app/dashboard/legacy'), { recursive: true });
    mkdirSync(join(dir, 'src/components/ui'), { recursive: true });
    mkdirSync(join(dir, 'marbella-os/2-diseno'), { recursive: true });
    cpSync(join(REPO, 'src/app/globals.css'), join(dir, 'src/app/globals.css'));
    writeFileSync(join(dir, 'src/lib/design-system/canon/proposals.json'), '{}\n');
    writeRegistry(emptyRegistry(), dir);
    writeFileSync(
        join(dir, 'marbella-os/2-diseno/BLUEPRINT-VISUAL.md'),
        renderBlueprint(loadRegistry(dir))
    );
    writeFileSync(
        join(dir, 'src/app/dashboard/legacy/NativeForm.tsx'),
        `export function NativeForm() {\n  return <input id="x" />;\n}\n`
    );
    writeFileSync(
        join(dir, 'src/components/ui/Field.tsx'),
        `export function Field() {\n  return <input />;\n}\n`
    );
    writeFileSync(
        join(dir, 'src/app/dashboard/legacy/GoodForm.tsx'),
        `import { Field } from '@/components/ui/Field';\nexport function GoodForm() {\n  return <Field><input /></Field>;\n}\n`
    );
    return dir;
}

describe('Visual studio — catálogo y canon estructurado', () => {
    it('solo usa los estados del Blueprint', () => {
        for (const element of STUDIO_ELEMENTS) {
            assert.ok(
                (CANON_STATUSES as readonly string[]).includes(element.status),
                `${element.id} tiene estado ilegal ${element.status}`
            );
        }
    });

    it('el Blueprint generado contiene cada fila del registro', () => {
        const markdown = renderBlueprint(emptyRegistry());
        for (const element of STUDIO_ELEMENTS) {
            assert.ok(
                markdown.includes(blueprintMatrixRow(element)),
                `falta «${element.label}» en el Blueprint generado`
            );
        }
        assert.match(markdown, /CANON CERRADO = contrato obligatorio/);
        assert.match(markdown, /registry\.json/);
    });

    it('CANON CERRADO no es congelable sin revisión', () => {
        const button = STUDIO_ELEMENTS.find((item) => item.id === 'button');
        assert.ok(button);
        const gate = gateCanonDecision(button, {});
        assert.equal(gate.ok, false);
    });

    it('Field 40 px exige token nuevo y no congela; sí puede ser propuesta', () => {
        const field = STUDIO_ELEMENTS.find((item) => item.id === 'field');
        assert.ok(field);
        const values = { ...actualValues(field), height: 'espacio.10-inexistente' };
        const canon = gateCanonDecision(field, values);
        assert.equal(canon.ok, false);
        if (!canon.ok) assert.match(canon.reason, /token/i);
        const proposal = gateProposalValues(field, values);
        assert.equal(proposal.ok, true);
    });

    it('las acciones de mutación exigen gateMaster en servidor', () => {
        const source = readFileSync(ACTIONS, 'utf8');
        assert.match(source, /async function gateMaster/);
        assert.match(source, /Solo master puede usar el estudio visual/);
        assert.match(source, /isMasterDashboardUser/);
        for (const name of ['saveStudioProposal', 'saveAsCanon', 'discardStudioProposal', 'confirmCanonDecision']) {
            assert.ok(source.includes(name), `falta ${name}`);
        }
        const saveAs = source.slice(source.indexOf('export async function saveAsCanon'));
        assert.ok(saveAs.includes('await gateMaster()'), 'saveAsCanon debe llamar a gateMaster');
    });
});

describe('Visual studio — propuesta no toca producción', () => {
    it('guardar propuesta no cambia CSS ni el registro', async () => {
        const dir = fixtureRepo();
        try {
            const cssBefore = readFileSync(join(dir, 'src/app/globals.css'), 'utf8');
            const field = getHydratedElement('field', loadRegistry(dir).elements);
            assert.ok(field);
            const values = { ...actualValues(field), radius: 'espacio.2' };
            const saved = saveProposal({
                elementId: 'field',
                lane: 'a',
                values,
                element: field,
                repoRoot: dir,
            });
            assert.equal(saved.ok, true);
            assert.equal(readFileSync(join(dir, 'src/app/globals.css'), 'utf8'), cssBefore);
            assert.equal(loadRegistry(dir).elements.field?.status, 'BORRADOR / PROPUESTA');
            assert.equal(loadProposals(dir).field?.a?.values.radius, 'espacio.2');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('Visual studio — promover a canon', () => {
    it('identidad CSS es ok y Field pasa a CANON CERRADO', async () => {
        const dir = fixtureRepo();
        try {
            const field = getHydratedElement('field', loadRegistry(dir).elements);
            assert.ok(field);
            const css = applyCssContract(field, actualValues(field), dir);
            assert.equal(css.ok, true);
            if (css.ok) assert.equal(css.unchanged, true);

            const result = await promoteToCanon({
                elementId: 'field',
                values: actualValues(field),
                repoRoot: dir,
                runTests: false,
            });
            assert.equal(result.ok, true, result.message);
            const registry = loadRegistry(dir);
            assert.equal(registry.elements.field?.status, 'CANON CERRADO');
            const blueprint = readFileSync(join(dir, 'marbella-os/2-diseno/BLUEPRINT-VISUAL.md'), 'utf8');
            assert.match(blueprint, /\| Field \| CANON CERRADO \|/);
            assert.equal(loadProposals(dir).field, undefined);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('un elemento cerrado exige revisión para volver a congelar', async () => {
        const dir = fixtureRepo();
        try {
            const button = getHydratedElement('button', loadRegistry(dir).elements);
            assert.ok(button);
            const blocked = await promoteToCanon({
                elementId: 'button',
                values: actualValues(button),
                repoRoot: dir,
                runTests: false,
            });
            assert.equal(blocked.ok, false);
            const revised = await promoteToCanon({
                elementId: 'button',
                values: actualValues(button),
                isRevision: true,
                repoRoot: dir,
                runTests: false,
            });
            assert.equal(revised.ok, true, revised.message);
            assert.equal(loadRegistry(dir).elements.button?.version, 2);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('la auditoría de Field marca nativos como deuda', () => {
        const dir = fixtureRepo();
        try {
            const field = getHydratedElement('field', loadRegistry(dir).elements);
            assert.ok(field);
            const audit = auditElement(field, dir);
            assert.ok(audit.pending.some((hit) => hit.file.includes('NativeForm.tsx')));
            assert.ok(!audit.pending.some((hit) => hit.file.includes('GoodForm.tsx')));
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
