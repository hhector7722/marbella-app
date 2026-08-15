import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { CONSUMPTION_BOTTOM_SHEET_COMPONENT_ID } from './consumption-bottom-sheet.ts';
import {
    MODAL_COMPONENT_ID,
    MODAL_VARIANTS,
    resolveModalVariant,
} from './modal-variants.ts';
import {
    MODAL_LAYERS,
    MODAL_LAYER_Z_CLASS,
    dispatchModalEscapeForTests,
    getModalSurfaceStackSnapshot,
    hasDerivedModalSurface,
    registerModalSurface,
    resetModalSurfaceStackForTests,
} from './modal-layers.ts';

describe('Modal identidad y variantes', () => {
    it('id de componente estable', () => {
        assert.equal(MODAL_COMPONENT_ID, 'Modal');
        assert.equal(CONSUMPTION_BOTTOM_SHEET_COMPONENT_ID, 'ConsumptionBottomSheet');
    });

    it('lista cerrada de variantes aprobadas', () => {
        assert.deepEqual([...MODAL_VARIANTS], [
            'compact',
            'standard',
            'work',
            'day',
            'amplify',
        ]);
    });

    it('cada variante resuelve max-width y política de altura', () => {
        assert.equal(resolveModalVariant('compact').maxWidthClass, 'max-w-sm');
        assert.equal(resolveModalVariant('compact').preferTall, false);
        assert.equal(resolveModalVariant('standard').maxWidthClass, 'max-w-md');
        assert.equal(resolveModalVariant('standard').preferTall, false);
        assert.equal(resolveModalVariant('work').maxWidthClass, 'max-w-4xl');
        assert.equal(resolveModalVariant('work').preferTall, true);
        assert.equal(resolveModalVariant('day').maxWidthClass, 'max-w-4xl');
        assert.equal(resolveModalVariant('day').preferTall, true);
        assert.equal(resolveModalVariant('amplify').maxWidthClass, 'max-w-2xl');
        assert.equal(resolveModalVariant('amplify').preferTall, false);
    });

    it('capas semánticas y clases z están definidas', () => {
        assert.deepEqual([...MODAL_LAYERS], ['base', 'derived', 'system', 'sheet']);
        assert.equal(MODAL_LAYER_Z_CLASS.base, 'z-[var(--z-modal-base)]');
        assert.equal(MODAL_LAYER_Z_CLASS.derived, 'z-[var(--z-modal-derived)]');
        assert.equal(MODAL_LAYER_Z_CLASS.system, 'z-[var(--z-modal-system)]');
        assert.equal(MODAL_LAYER_Z_CLASS.sheet, 'z-[var(--z-modal-sheet)]');
    });
});

describe('Modal capas y nesting (ADR-0007)', () => {
    beforeEach(() => {
        resetModalSurfaceStackForTests();
    });

    it('permite base + una derived', () => {
        const base = registerModalSurface({
            id: 'base-1',
            layer: 'base',
            onEscape: () => {},
        });
        assert.equal(base.ok, true);

        const derived = registerModalSurface({
            id: 'derived-1',
            layer: 'derived',
            onEscape: () => {},
        });
        assert.equal(derived.ok, true);
        assert.equal(hasDerivedModalSurface(), true);
        assert.equal(getModalSurfaceStackSnapshot().length, 2);

        if (base.ok) base.unregister();
        if (derived.ok) derived.unregister();
    });

    it('rechaza derived sin base', () => {
        const orphan = registerModalSurface({
            id: 'derived-orphan',
            layer: 'derived',
            onEscape: () => {},
        });
        assert.equal(orphan.ok, false);
        if (!orphan.ok) assert.equal(orphan.reason, 'derived-without-base');
        assert.equal(getModalSurfaceStackSnapshot().length, 0);
    });

    it('rechaza una segunda superficie derived (tercera capa de negocio)', () => {
        const a = registerModalSurface({
            id: 'base-1',
            layer: 'base',
            onEscape: () => {},
        });
        const b = registerModalSurface({
            id: 'derived-1',
            layer: 'derived',
            onEscape: () => {},
        });
        const c = registerModalSurface({
            id: 'derived-2',
            layer: 'derived',
            onEscape: () => {},
        });

        assert.equal(a.ok, true);
        assert.equal(b.ok, true);
        assert.equal(c.ok, false);
        if (!c.ok) assert.equal(c.reason, 'derived-already-open');
        assert.equal(getModalSurfaceStackSnapshot().length, 2);

        if (a.ok) a.unregister();
        if (b.ok) b.unregister();
    });

    it('Escape cierra solo la cima de la pila', () => {
        const closed: string[] = [];
        const base = registerModalSurface({
            id: 'base-1',
            layer: 'base',
            onEscape: () => closed.push('base'),
        });
        const derived = registerModalSurface({
            id: 'derived-1',
            layer: 'derived',
            onEscape: () => closed.push('derived'),
        });
        assert.equal(base.ok && derived.ok, true);

        dispatchModalEscapeForTests();
        assert.deepEqual(closed, ['derived']);

        if (derived.ok) derived.unregister();
        dispatchModalEscapeForTests();
        assert.deepEqual(closed, ['derived', 'base']);

        if (base.ok) base.unregister();
    });

    it('permite system y sheet junto a base (BottomSheet excepción)', () => {
        const base = registerModalSurface({
            id: 'base-1',
            layer: 'base',
            onEscape: () => {},
        });
        const system = registerModalSurface({
            id: 'sys-1',
            layer: 'system',
            onEscape: () => {},
        });
        const sheet = registerModalSurface({
            id: 'sheet-1',
            layer: 'sheet',
            onEscape: () => {},
        });
        assert.equal(base.ok && system.ok && sheet.ok, true);
        assert.equal(getModalSurfaceStackSnapshot().length, 3);
        if (base.ok) base.unregister();
        if (system.ok) system.unregister();
        if (sheet.ok) sheet.unregister();
    });
});
