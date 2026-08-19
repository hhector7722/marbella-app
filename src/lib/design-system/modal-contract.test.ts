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
    isModalSurfaceSubordinate,
    registerModalSurface,
    resetModalSurfaceStackForTests,
} from './modal-layers.ts';
import {
    getModalHistorySnapshot,
    hasLiveModalParent,
    notifyModalHistoryClose,
    registerModalHistory,
    requestModalClose,
    resetModalHistoryForTests,
    resolveModalHistoryParentSurfaceId,
    unregisterModalHistory,
} from './modal-history.ts';
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

    it('cada variante resuelve max-width y política de altura', () => {
        assert.equal(resolveModalVariant('compact').maxWidthClass, 'max-w-sm');
        assert.equal(resolveModalVariant('compact').preferTall, false);
        assert.equal(resolveModalVariant('standard').maxWidthClass, 'max-w-md');
        assert.equal(resolveModalVariant('standard').preferTall, false);
        assert.equal(resolveModalVariant('work').maxWidthClass, 'max-w-6xl');
        assert.equal(resolveModalVariant('work').preferTall, true);
        assert.equal(resolveModalVariant('day').maxWidthClass, 'max-w-6xl');
        assert.equal(resolveModalVariant('day').preferTall, true);
        assert.equal(resolveModalVariant('amplify').maxWidthClass, 'max-w-2xl');
        assert.equal(resolveModalVariant('amplify').preferTall, false);
    });

    it('work/day = max-width 1152px', () => {
        // Tailwind: max-w-6xl = 72rem = 1152px
        assert.equal(resolveModalVariant('work').maxWidthClass, 'max-w-6xl');
        assert.equal(resolveModalVariant('day').maxWidthClass, 'max-w-6xl');
        const remToPx = (rem: number) => rem * 16;
        assert.equal(remToPx(72), 1152);
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
        assert.match(css, /align-self:\s*stretch/);
        assert.match(css, /text-box-trim:\s*trim-both/);
        assert.match(css, /text-box-edge:\s*cap\s+alphabetic/);
        assert.equal(css.includes('translate-y'), false);
        assert.match(css, /--modal-body-start-gap:\s*var\(--espacio-3\)/);
        assert.match(css, /\[data-component='Modal'\] \[data-element='container'\]/);
        assert.match(css, /border-radius:\s*var\(--radio-superficie\)/);
        assert.match(css, /\[data-component='Modal'\] \[data-element='body'\]/);
        assert.match(css, /padding-top:\s*var\(--modal-body-start-gap\)/);
        assert.match(css, /--modal-content-inset-start:\s*var\(--modal-header-inset\)/);
        assert.match(css, /\[data-element='container'\]\[data-has-back='true'\]/);
        assert.match(css, /padding-inline-start:\s*var\(--modal-content-inset-start\)/);
        assert.match(css, /\[data-element='footer'\][\s\S]*flex-wrap:\s*nowrap/);
        assert.match(css, /\[data-subordinate='true'\]/);
        assert.match(css, /--modal-subordinate-blur:/);
        assert.match(modalSource, /headerToneProp \?\? headerVariant \?\? 'petroleum'/);
        assert.match(modalSource, /isModalSurfaceSubordinate/);
        assert.match(modalSource, /data-has-back/);
        assert.match(modalSource, /Botón ad-hoc en body/);
        assert.match(modalSource, /data-subordinate/);
        assert.equal(modalSource.includes("?? 'white'"), false);
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

    it('superficie cubierta queda subordinada en la pila', () => {
        const base = registerModalSurface({
            id: 'base-1',
            layer: 'base',
            onEscape: () => {},
        });
        assert.equal(base.ok, true);
        assert.equal(isModalSurfaceSubordinate('base-1'), false);

        const derived = registerModalSurface({
            id: 'derived-1',
            layer: 'derived',
            onEscape: () => {},
        });
        assert.equal(derived.ok, true);
        assert.equal(isModalSurfaceSubordinate('base-1'), true);
        assert.equal(isModalSurfaceSubordinate('derived-1'), false);

        if (derived.ok) derived.unregister();
        assert.equal(isModalSurfaceSubordinate('base-1'), false);

        if (base.ok) base.unregister();
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

describe('Modal navegación padre→hijo (historial ≠ layer)', () => {
    beforeEach(() => {
        resetModalHistoryForTests();
        resetModalSurfaceStackForTests();
    });

    function registerNav(input: {
        surfaceId: string;
        instance?: string;
        parentInstance?: string;
        layer?: 'base' | 'derived' | 'system' | 'sheet';
        events: string[];
    }) {
        registerModalHistory({
            surfaceId: input.surfaceId,
            instance: input.instance,
            parentInstance: input.parentInstance,
            layer: input.layer ?? 'base',
            dismiss: () => input.events.push(`dismiss:${input.surfaceId}`),
            restore: () => input.events.push(`restore:${input.surfaceId}`),
        });
    }

    it('1. raíz sin padre no muestra ←', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'root', instance: 'a', events });
        assert.equal(hasLiveModalParent('root'), false);
        assert.equal(getModalSurfaceStackSnapshot().length, 0);
    });

    it('2. padre válido muestra ←', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'a', instance: 'supplier-detail', events });
        registerNav({
            surfaceId: 'b',
            instance: 'supplier-edit',
            parentInstance: 'supplier-detail',
            events,
        });
        assert.equal(hasLiveModalParent('b'), true);
        assert.equal(hasLiveModalParent('a'), false);
    });

    it('3. A→B→back→A', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'a', instance: 'a', events });
        registerNav({ surfaceId: 'b', instance: 'b', parentInstance: 'a', events });
        requestModalClose('b');
        assert.deepEqual(events, ['dismiss:b']);
        assert.equal(getModalHistorySnapshot().map((e) => e.surfaceId).join(','), 'a');
        assert.equal(hasLiveModalParent('a'), false);
    });

    it('4. A→B→C→back→B→back→A', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'a', instance: 'a', events });
        registerNav({ surfaceId: 'b', instance: 'b', parentInstance: 'a', events });
        registerNav({ surfaceId: 'c', instance: 'c', parentInstance: 'b', events });
        requestModalClose('c');
        assert.equal(getModalHistorySnapshot().map((e) => e.surfaceId).join(','), 'a,b');
        requestModalClose('b');
        assert.equal(getModalHistorySnapshot().map((e) => e.surfaceId).join(','), 'a');
        assert.deepEqual(events, ['dismiss:c', 'dismiss:b']);
    });

    it('5. X hijo = pop', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'a', instance: 'a', events });
        registerNav({ surfaceId: 'b', instance: 'b', parentInstance: 'a', events });
        requestModalClose('b');
        assert.deepEqual(events, ['dismiss:b']);
        assert.equal(getModalHistorySnapshot().length, 1);
    });

    it('6. Escape hijo = pop', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'a', instance: 'a', events });
        registerNav({ surfaceId: 'b', instance: 'b', parentInstance: 'a', events });
        const base = registerModalSurface({
            id: 'a-overlay',
            layer: 'base',
            onEscape: () => requestModalClose('a'),
        });
        const derived = registerModalSurface({
            id: 'b-overlay',
            layer: 'derived',
            onEscape: () => requestModalClose('b'),
        });
        assert.equal(base.ok && derived.ok, true);
        dispatchModalEscapeForTests();
        assert.deepEqual(events, ['dismiss:b']);
        if (derived.ok) derived.unregister();
        if (base.ok) base.unregister();
    });

    it('7. Backdrop hijo = pop', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'a', instance: 'a', events });
        registerNav({ surfaceId: 'b', instance: 'b', parentInstance: 'a', events });
        requestModalClose('b');
        assert.deepEqual(events, ['dismiss:b']);
        assert.equal(
            getModalHistorySnapshot().some((e) => e.surfaceId === 'a'),
            true
        );
    });

    it('8. X raíz = dismiss completo', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'a', instance: 'a', events });
        registerNav({ surfaceId: 'b', instance: 'b', parentInstance: 'a', events });
        registerNav({ surfaceId: 'c', instance: 'c', parentInstance: 'b', events });
        requestModalClose('a');
        assert.deepEqual(events, ['dismiss:c', 'dismiss:b', 'dismiss:a']);
        assert.equal(getModalHistorySnapshot().length, 0);
    });

    it('9. Escape raíz = dismiss completo', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'a', instance: 'a', events });
        const overlay = registerModalSurface({
            id: 'a-overlay',
            layer: 'base',
            onEscape: () => requestModalClose('a'),
        });
        assert.equal(overlay.ok, true);
        dispatchModalEscapeForTests();
        assert.deepEqual(events, ['dismiss:a']);
        assert.equal(getModalHistorySnapshot().length, 0);
        if (overlay.ok) overlay.unregister();
    });

    it('10. dos cadenas independientes no se interfieren', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'a1', instance: 'chain-a', events });
        registerNav({ surfaceId: 'b1', instance: 'chain-a-child', parentInstance: 'chain-a', events });
        registerNav({ surfaceId: 'a2', instance: 'chain-b', events });
        registerNav({ surfaceId: 'b2', instance: 'chain-b-child', parentInstance: 'chain-b', events });
        requestModalClose('b1');
        assert.equal(
            getModalHistorySnapshot().map((e) => e.surfaceId).join(','),
            'a1,a2,b2'
        );
        assert.equal(hasLiveModalParent('b2'), true);
        assert.deepEqual(events, ['dismiss:b1']);
    });

    it('11. padre desmontado no deja huérfano', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'a', instance: 'a', events });
        registerNav({ surfaceId: 'b', instance: 'b', parentInstance: 'a', events });
        unregisterModalHistory('a');
        assert.equal(hasLiveModalParent('b'), false);
        assert.equal(
            resolveModalHistoryParentSurfaceId('a', 'b'),
            undefined
        );
        const snap = getModalHistorySnapshot();
        assert.equal(snap.some((e) => e.surfaceId === 'a'), false);
        assert.equal(
            snap.every((e) => {
                if (!e.parentInstance) return true;
                return (
                    resolveModalHistoryParentSurfaceId(e.parentInstance, e.surfaceId) !== undefined
                    || e.parentInstance === 'a'
                );
            }),
            true
        );
        assert.equal(resolveModalHistoryParentSurfaceId('a', 'b'), undefined);
    });

    it('12. system no es padre', () => {
        const events: string[] = [];
        registerNav({
            surfaceId: 'sys',
            instance: 'confirm',
            layer: 'system',
            events,
        });
        registerNav({
            surfaceId: 'child',
            instance: 'task',
            parentInstance: 'confirm',
            events,
        });
        assert.equal(hasLiveModalParent('child'), false);
        assert.equal(resolveModalHistoryParentSurfaceId('confirm', 'child'), undefined);
    });

    it('13. derived no implica ←', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'base', instance: 'base', events });
        registerNav({
            surfaceId: 'derived',
            instance: 'aux',
            layer: 'derived',
            events,
        });
        assert.equal(hasLiveModalParent('derived'), false);
    });

    it('14. base puede tener padre', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'a', instance: 'a', layer: 'base', events });
        registerNav({
            surfaceId: 'b',
            instance: 'b',
            parentInstance: 'a',
            layer: 'base',
            events,
        });
        assert.equal(hasLiveModalParent('b'), true);
    });

    it('15. identidades internas distintas aunque se reutilice instance', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 's1', instance: 'same', events });
        registerNav({ surfaceId: 's2', instance: 'same', events });
        const snap = getModalHistorySnapshot();
        assert.equal(snap.length, 2);
        assert.equal(snap[0]?.surfaceId, 's1');
        assert.equal(snap[1]?.surfaceId, 's2');
        assert.equal(snap[0]?.instance, 'same');
        assert.equal(snap[1]?.instance, 'same');
        assert.notEqual(snap[0]?.surfaceId, snap[1]?.surfaceId);
    });

    it('padre aparcado se restaura al pop sin duplicar', () => {
        const events: string[] = [];
        registerNav({ surfaceId: 'a', instance: 'a', events });
        registerNav({ surfaceId: 'b', instance: 'b', parentInstance: 'a', events });
        notifyModalHistoryClose('a');
        const parked = getModalHistorySnapshot().find((e) => e.surfaceId === 'a');
        assert.equal(parked?.parked, true);
        assert.equal(hasLiveModalParent('b'), true);
        requestModalClose('b');
        assert.deepEqual(events, ['dismiss:b', 'restore:a']);
        const after = getModalHistorySnapshot();
        assert.equal(after.filter((e) => e.surfaceId === 'a').length, 1);
        assert.equal(after.some((e) => e.surfaceId === 'b'), false);
    });

    it('chrome: ← solo con padre vivo; X/Escape/backdrop comparten requestModalClose; onBack no es el historial', () => {
        const modalSource = readFileSync(
            join(process.cwd(), 'src/components/ui/modal.tsx'),
            'utf8'
        );
        assert.match(modalSource, /parentInstance\?: string/);
        assert.match(modalSource, /hasLiveModalParent\(surfaceId\)/);
        assert.match(modalSource, /requestModalClose\(surfaceId\)/);
        assert.match(modalSource, /onEscape: \(\) => requestCloseRef\.current\(\)/);
        assert.match(modalSource, /closeOnBackdrop \? \(\) => requestCloseRef\.current\(\)/);
        assert.match(modalSource, /onClose=\{\(\) => requestCloseRef\.current\(\)\}/);
        assert.match(modalSource, /showNavBack \? \(\) => requestCloseRef\.current\(\) : onBack/);
        assert.match(modalSource, /data-element="back"/);
        assert.equal(modalSource.includes('getModalSurfaceStackSnapshot'), false);
        assert.match(modalSource, /onBack\?: \(\) => void/);
        const historySource = readFileSync(
            join(process.cwd(), 'src/lib/design-system/modal-history.ts'),
            'utf8'
        );
        assert.equal(historySource.includes('registerModalSurface'), false);
        assert.match(historySource, /Navegación ≠ layer ≠ z-index/);
    });
});
