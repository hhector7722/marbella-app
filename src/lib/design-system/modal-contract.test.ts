import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, beforeEach } from 'node:test';

import { CONSUMPTION_BOTTOM_SHEET_COMPONENT_ID } from './consumption-bottom-sheet.ts';
import {
    MODAL_BACKDROP_BASE,
    MODAL_BACKDROP_ELEVATED,
    resolveModalBackdropKind,
} from './modal-backdrop.ts';
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
import { DS_SCREEN_TOKENS } from './tokens.ts';
import { pickModalPanelClassName } from './modal-panel-class.ts';

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

    it('cada variante resuelve max-width y política de altura (ref. Albaranes work=5xl)', () => {
        assert.equal(resolveModalVariant('compact').maxWidthClass, 'max-w-sm');
        assert.equal(resolveModalVariant('compact').preferTall, false);
        assert.equal(resolveModalVariant('standard').maxWidthClass, 'max-w-md');
        assert.equal(resolveModalVariant('standard').preferTall, false);
        assert.equal(resolveModalVariant('work').maxWidthClass, 'max-w-5xl');
        assert.equal(resolveModalVariant('work').preferTall, true);
        assert.equal(resolveModalVariant('day').maxWidthClass, 'max-w-5xl');
        assert.equal(resolveModalVariant('day').preferTall, true);
        assert.equal(resolveModalVariant('amplify').maxWidthClass, 'max-w-2xl');
        assert.equal(resolveModalVariant('amplify').preferTall, false);
    });

    it('tokens dimensionales alineados a Albaranes', () => {
        assert.equal(DS_SCREEN_TOKENS.modalHeaderHeight, '36px');
        assert.equal(DS_SCREEN_TOKENS.modalHeaderInset, DS_SCREEN_TOKENS.espacio4);
        assert.equal(DS_SCREEN_TOKENS.modalHeaderInset, '16px');
        assert.equal(DS_SCREEN_TOKENS.modalBodyStartGap, DS_SCREEN_TOKENS.espacio3);
        assert.equal(DS_SCREEN_TOKENS.modalBodyStartGap, '12px');
        assert.equal(DS_SCREEN_TOKENS.radioSuperficie, '16px');
        assert.match(DS_SCREEN_TOKENS.modalMaxHeight, /68dvh/);
        assert.match(DS_SCREEN_TOKENS.modalMaxHeight, /2\.5rem/);
        assert.equal(DS_SCREEN_TOKENS.modalOverlayBase, 'rgba(0, 0, 0, 0.32)');
        assert.equal(DS_SCREEN_TOKENS.modalOverlayBaseFilter, 'blur(8px) saturate(65%)');
        assert.equal(DS_SCREEN_TOKENS.modalOverlayElevated, 'rgba(0, 0, 0, 0.28)');
    });

    it('capas semánticas y clases z están definidas', () => {
        assert.deepEqual([...MODAL_LAYERS], ['base', 'derived', 'system', 'sheet']);
        assert.equal(MODAL_LAYER_Z_CLASS.base, 'z-[var(--z-modal-base)]');
        assert.equal(MODAL_LAYER_Z_CLASS.derived, 'z-[var(--z-modal-derived)]');
        assert.equal(MODAL_LAYER_Z_CLASS.system, 'z-[var(--z-modal-system)]');
        assert.equal(MODAL_LAYER_Z_CLASS.sheet, 'z-[var(--z-modal-sheet)]');
    });

    it('className del panel no puede sobrescribir el radio', () => {
        const kept = pickModalPanelClassName(
            'max-w-lg rounded-3xl rounded-[2rem] sm:rounded-2xl relative min-h-0'
        );
        assert.equal(kept, 'max-w-lg relative min-h-0');
        assert.equal(kept.includes('rounded'), false);
    });
    it('CSS bloquea radio del panel, cabecera 36px y gap Header→Body 12px', () => {
        const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
        const modalSource = readFileSync(
            join(process.cwd(), 'src/components/ui/modal.tsx'),
            'utf8'
        );
        assert.match(css, /--modal-header-height:\s*36px/);
        assert.match(css, /--modal-header-inset:\s*var\(--espacio-4\)/);
        assert.match(css, /\[data-component='Modal'\] \[data-element='header'\]/);
        assert.match(css, /padding-inline:\s*var\(--modal-header-inset\)/);
        assert.match(css, /\[data-element='heading'\]/);
        assert.match(css, /flex-direction:\s*row/);
        assert.match(css, /--modal-body-start-gap:\s*var\(--espacio-3\)/);
        assert.match(css, /\[data-component='Modal'\] \[data-element='container'\]/);
        assert.match(css, /border-radius:\s*var\(--radio-superficie\)/);
        assert.match(css, /\[data-component='Modal'\] \[data-element='body'\]/);
        assert.match(css, /padding-top:\s*var\(--modal-body-start-gap\)/);
        assert.match(css, /\[data-component='Modal'\]\[data-layer='base'\]/);
        assert.match(css, /z-index:\s*var\(--z-modal-base\)/);
        assert.match(css, /z-index:\s*var\(--z-modal-derived\)/);
        assert.match(css, /z-index:\s*var\(--z-modal-system\)/);
        assert.match(modalSource, /data-element="heading"/);
        assert.equal(modalSource.includes('hideTitle || titleLeft'), false);
        assert.equal(modalSource.includes('flex-col justify-center'), false);
    });
});

describe('Modal backdrop por capa (ADR-0008)', () => {
    it('base y sheet usan blur(8px) saturate(65%) + rgba 0.32', () => {
        assert.equal(MODAL_BACKDROP_BASE.blurPx, 8);
        assert.equal(MODAL_BACKDROP_BASE.saturatePercent, 65);
        assert.equal(MODAL_BACKDROP_BASE.background, 'rgba(0, 0, 0, 0.32)');
        assert.equal(MODAL_BACKDROP_BASE.filter, 'blur(8px) saturate(65%)');
        assert.equal(resolveModalBackdropKind('base'), 'base');
        assert.equal(resolveModalBackdropKind('sheet'), 'base');
    });

    it('derived y system solo oscurecen (sin filtros acumulados)', () => {
        assert.equal(MODAL_BACKDROP_ELEVATED.filter, 'none');
        assert.equal(MODAL_BACKDROP_ELEVATED.background, 'rgba(0, 0, 0, 0.28)');
        assert.equal(resolveModalBackdropKind('derived'), 'elevated');
        assert.equal(resolveModalBackdropKind('system'), 'elevated');
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

    it('permite system como sub-submodal sobre base+derived', () => {
        const base = registerModalSurface({
            id: 'base-1',
            layer: 'base',
            onEscape: () => {},
        });
        const derived = registerModalSurface({
            id: 'derived-1',
            layer: 'derived',
            onEscape: () => {},
        });
        const system = registerModalSurface({
            id: 'sys-1',
            layer: 'system',
            onEscape: () => {},
        });
        assert.equal(base.ok && derived.ok && system.ok, true);
        assert.equal(getModalSurfaceStackSnapshot().length, 3);
        if (base.ok) base.unregister();
        if (derived.ok) derived.unregister();
        if (system.ok) system.unregister();
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
