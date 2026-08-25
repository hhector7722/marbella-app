import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRegistry, writeRegistry, emptyRegistry } from '../canon/io.ts';
import { promoteToCanon } from '../canon/promote.ts';
import { blueprintMatrixRow, renderBlueprint } from '../canon/render-blueprint.ts';
import {
    getStudioElement,
    HEADER_SPECIALIZED_IDS,
    isIndependentVisualCanon,
    STUDIO_ELEMENTS,
} from './catalog.ts';
import { freezeableElement, gateCanonDecision } from './decision.ts';

describe('Taxonomía de cabeceras', () => {
    it('page-header es CANON CERRADO y no cambia valores', () => {
        const element = getStudioElement('page-header');
        assert.ok(element);
        assert.equal(element.status, 'CANON CERRADO');
        assert.equal(element.properties.find((item) => item.id === 'title-size')?.actualId, 'tipo.titulo-pantalla');
        assert.equal(element.properties.find((item) => item.id === 'px')?.actualId, 'espacio.4');
        assert.equal(element.properties.find((item) => item.id === 'py')?.actualId, 'espacio.4');
        assert.match(element.warning ?? '', /T1/);
    });

    it('block-header permanece SIN CANON y no es congelable', () => {
        const element = getStudioElement('block-header');
        assert.ok(element);
        assert.equal(element.status, 'SIN CANON');
        assert.equal(element.promotePolicy, 'proposal-only');
        assert.equal(freezeableElement('block-header'), undefined);
        const gate = gateCanonDecision(element, {});
        assert.equal(gate.ok, false);
    });

    it('table apunta a T8 y no es familia de cabecera independiente', () => {
        const table = getStudioElement('table');
        const pointer = getStudioElement('table-header');
        assert.ok(table);
        assert.ok(pointer);
        assert.equal(table.status, 'BORRADOR / PROPUESTA');
        assert.equal(pointer.redirectTo, 'table');
        assert.equal(pointer.registry, false);
        assert.equal(isIndependentVisualCanon(pointer), false);
        assert.match(blueprintMatrixRow(pointer), /Table \/ T8/);
    });

    it('modal-header es CANON CERRADO con 36 px documentados', () => {
        const element = getStudioElement('modal-header');
        assert.ok(element);
        assert.equal(element.status, 'CANON CERRADO');
        assert.equal(element.applyKind, 'locked');
        assert.ok(element.facts?.some((fact) => fact.value.includes('36 px')));
        const gate = gateCanonDecision(element, {});
        assert.equal(gate.ok, false);
    });

    it('derived hereda modal-header y no es un segundo contrato visual', () => {
        const derived = getStudioElement('derived-modal-header');
        const registry = loadRegistry();
        assert.ok(derived);
        assert.equal(derived.status, 'HEREDADO');
        assert.equal(derived.inherits, 'modal-header');
        assert.equal(derived.properties.length, 0);
        assert.notEqual(derived.status, 'CANON CERRADO');
        assert.equal(isIndependentVisualCanon(derived), false);
        assert.equal(freezeableElement('derived-modal-header'), undefined);
        assert.equal(freezeableElement('derived-modal-header', true), undefined);
        assert.equal(registry.elements['derived-modal-header']?.status, 'HEREDADO');
        assert.equal(registry.elements['derived-modal-header']?.inherits, 'modal-header');
        assert.notEqual(registry.elements['derived-modal-header']?.status, 'CANON CERRADO');
        const gate = gateCanonDecision(derived, {});
        assert.equal(gate.ok, false);
        assert.match(blueprintMatrixRow(derived), /HEREDADO \(hereda Modal Header\)/);
    });

    it('no se puede promover derived-modal-header a canon visual independiente', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'ds-header-'));
        mkdirSync(join(dir, '.git'));
        try {
            writeRegistry(emptyRegistry(), dir);
            const blocked = await promoteToCanon({
                elementId: 'derived-modal-header',
                values: {},
                repoRoot: dir,
                runTests: false,
            });
            assert.equal(blocked.ok, false);
            const revised = await promoteToCanon({
                elementId: 'derived-modal-header',
                values: {},
                isRevision: true,
                repoRoot: dir,
                runTests: false,
            });
            assert.equal(revised.ok, false);
            assert.equal(loadRegistry(dir).elements['derived-modal-header']?.status, 'HEREDADO');
            assert.equal(loadRegistry(dir).elements['derived-modal-header']?.inherits, 'modal-header');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('T1 y el resto de cabeceras especializadas no son canon universal', () => {
        const t1 = getStudioElement('header-t1-sala-staff');
        const ventas = getStudioElement('header-t1-ventas');
        assert.ok(t1);
        assert.ok(ventas);
        assert.equal(t1.status, 'ESPECIALIZADO');
        assert.equal(ventas.status, 'ESPECIALIZADO');
        assert.match(ventas.summary, /no debe convertirse automáticamente en Page Header/i);
        for (const id of HEADER_SPECIALIZED_IDS) {
            const element = getStudioElement(id);
            assert.ok(element, id);
            assert.equal(element.status, 'ESPECIALIZADO');
            assert.equal(isIndependentVisualCanon(element), false);
            assert.equal(freezeableElement(id), undefined);
        }
    });

    it('el Blueprint refleja la taxonomía de cabeceras', () => {
        const markdown = renderBlueprint(loadRegistry());
        assert.match(markdown, /\| Cabecera de página \| CANON CERRADO \|/);
        assert.match(markdown, /\| Cabecera de bloque \| SIN CANON \|/);
        assert.match(markdown, /\| Cabecera de tabla \| Parte de Table \/ T8 \|/);
        assert.match(markdown, /\| Cabecera de modal \| CANON CERRADO \|/);
        assert.match(markdown, /36 px/);
        assert.match(markdown, /\| Cabecera de modal derived \| HEREDADO \(hereda Modal Header\) \|/);
        assert.doesNotMatch(markdown, /\| Cabecera de modal derived \| CANON CERRADO \|/);
        assert.match(markdown, /\| T1 · Sala \/ Staff \| ESPECIALIZADO \|/);
        assert.match(markdown, /\| T1 · Ventas \| ESPECIALIZADO \|/);
        assert.match(markdown, /\| Table \/ T8 \| BORRADOR \/ PROPUESTA \|/);
        for (const element of STUDIO_ELEMENTS.filter((item) => item.group === 'cabeceras')) {
            assert.ok(markdown.includes(blueprintMatrixRow(element)), element.id);
        }
    });
});
