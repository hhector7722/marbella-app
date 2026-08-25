import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { emptyRegistry } from '../canon/io.ts';
import { blueprintMatrixRow, renderBlueprint } from '../canon/render-blueprint.ts';
import { STUDIO_ELEMENTS } from './catalog.ts';
import { gateCanonDecision } from './decision.ts';
import { CANON_STATUSES } from './types.ts';

const BLUEPRINT = join(process.cwd(), 'marbella-os/2-diseno/BLUEPRINT-VISUAL.md');

describe('Visual studio — catálogo alineado al Blueprint', () => {
    it('solo usa los estados del Blueprint', () => {
        for (const element of STUDIO_ELEMENTS) {
            assert.ok(
                (CANON_STATUSES as readonly string[]).includes(element.status),
                `${element.id} tiene estado ilegal ${element.status}`
            );
        }
    });

    it('el Blueprint del repo coincide con el registro técnico', () => {
        const markdown = readFileSync(BLUEPRINT, 'utf8');
        const generated = renderBlueprint(emptyRegistry());
        assert.match(markdown, /CANON CERRADO = contrato obligatorio/);
        assert.match(markdown, /src\/lib\/design-system\/canon\/registry\.json/);
        for (const element of STUDIO_ELEMENTS) {
            assert.ok(markdown.includes(`| ${element.label} |`), `el Blueprint no lista ${element.label}`);
            assert.ok(
                markdown.includes(blueprintMatrixRow(element)),
                `fila incorrecta para ${element.label}`
            );
        }
        assert.match(generated, /\| Field \| BORRADOR \/ PROPUESTA \|/);
    });

    it('CANON CERRADO no es congelable', () => {
        const button = STUDIO_ELEMENTS.find((item) => item.id === 'button');
        assert.ok(button);
        const gate = gateCanonDecision(button, {});
        assert.equal(gate.ok, false);
    });

    it('Field 40 px exige token nuevo y no congela', () => {
        const field = STUDIO_ELEMENTS.find((item) => item.id === 'field');
        assert.ok(field);
        const gate = gateCanonDecision(field, { height: 'espacio.10-inexistente' });
        assert.equal(gate.ok, false);
        if (!gate.ok) assert.match(gate.reason, /token/i);
    });

    it('no inventa una segunda fuente de verdad tipo CANON.md visual', () => {
        assert.equal(STUDIO_ELEMENTS.some((item) => item.id === 'button'), true);
        const markdown = readFileSync(BLUEPRINT, 'utf8');
        assert.match(markdown, /CANON CERRADO = contrato obligatorio/);
        assert.doesNotMatch(markdown, /DEUDA DE IMPLEMENTACIÓN: control nativo/);
    });
});
