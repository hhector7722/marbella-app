import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    canRedo,
    canUndo,
    createHistory,
    isNativeTextEditingTarget,
    pushHistory,
    redoHistory,
    resetHistory,
    undoHistory,
    type EditSnapshot,
} from './history.ts';

function snap(overrides: Record<string, unknown>, id = 'est-1'): EditSnapshot {
    return { id, recipe: {}, overrides };
}

describe('historial Deshacer / Rehacer', () => {
    it('una modificación y Deshacer la revierte', () => {
        let history = createHistory(snap({ a: 0 }));
        history = pushHistory(history, snap({ a: 1 }));
        assert.equal(canUndo(history), true);
        history = undoHistory(history);
        assert.deepEqual(history.present.overrides, { a: 0 });
        assert.equal(canUndo(history), false);
    });

    it('dos modificaciones se revierten en orden inverso, una a una', () => {
        let history = createHistory(snap({ n: 16 }));
        history = pushHistory(history, snap({ n: 17 }));
        history = pushHistory(history, snap({ n: 18 }));
        history = pushHistory(history, snap({ n: 19 }));

        history = undoHistory(history);
        assert.deepEqual(history.present.overrides, { n: 18 });
        history = undoHistory(history);
        assert.deepEqual(history.present.overrides, { n: 17 });
        history = undoHistory(history);
        assert.deepEqual(history.present.overrides, { n: 16 });
    });

    it('Rehacer recupera exactamente los estados anteriores', () => {
        let history = createHistory(snap({ n: 1 }));
        history = pushHistory(history, snap({ n: 2 }));
        history = pushHistory(history, snap({ n: 3 }));
        history = undoHistory(history);
        history = undoHistory(history);
        assert.deepEqual(history.present.overrides, { n: 1 });

        history = redoHistory(history);
        assert.deepEqual(history.present.overrides, { n: 2 });
        history = redoHistory(history);
        assert.deepEqual(history.present.overrides, { n: 3 });
        assert.equal(canRedo(history), false);
    });

    it('una nueva acción tras Deshacer descarta la rama de Rehacer', () => {
        let history = createHistory(snap({ step: 'A' }));
        history = pushHistory(history, snap({ step: 'B' }));
        history = pushHistory(history, snap({ step: 'C' }));
        history = pushHistory(history, snap({ step: 'D' }));
        history = undoHistory(history); // C
        history = undoHistory(history); // B
        assert.equal(canRedo(history), true);

        history = pushHistory(history, snap({ step: 'E' }));
        assert.equal(canRedo(history), false);
        assert.deepEqual(history.present.overrides, { step: 'E' });

        // Rehacer ya no puede volver a D.
        history = redoHistory(history);
        assert.deepEqual(history.present.overrides, { step: 'E' });

        history = undoHistory(history);
        assert.deepEqual(history.present.overrides, { step: 'B' });
    });

    it('cada pulsación de stepper es una acción independiente', () => {
        let history = createHistory(snap({ size: '16px' }));
        for (const size of ['17px', '18px', '19px']) {
            history = pushHistory(history, snap({ size }));
        }
        assert.equal(history.past.length, 3);
        history = undoHistory(history);
        assert.deepEqual(history.present.overrides, { size: '18px' });
        history = undoHistory(history);
        assert.deepEqual(history.present.overrides, { size: '17px' });
        history = undoHistory(history);
        assert.deepEqual(history.present.overrides, { size: '16px' });
    });

    it('RESET es una acción que se puede deshacer y rehacer', () => {
        let history = createHistory(snap({ color: '#111', size: '16px' }));
        history = pushHistory(history, snap({ color: '#f00', size: '16px' }));
        history = pushHistory(history, snap({ color: '#f00', size: '20px' }));
        history = pushHistory(history, snap({})); // RESET

        history = undoHistory(history);
        assert.deepEqual(history.present.overrides, { color: '#f00', size: '20px' });
        history = redoHistory(history);
        assert.deepEqual(history.present.overrides, {});
    });

    it('no crea snapshot si el estado no cambia', () => {
        let history = createHistory(snap({ a: 1 }));
        history = pushHistory(history, snap({ a: 1 }));
        assert.equal(history.past.length, 0);
        assert.equal(canUndo(history), false);
    });

    it('los botones se deshabilitan según el historial vacío', () => {
        const empty = createHistory(snap({}));
        assert.equal(canUndo(empty), false);
        assert.equal(canRedo(empty), false);
        const withPast = pushHistory(empty, snap({ x: 1 }));
        assert.equal(canUndo(withPast), true);
        assert.equal(canRedo(withPast), false);
        const afterUndo = undoHistory(withPast);
        assert.equal(canUndo(afterUndo), false);
        assert.equal(canRedo(afterUndo), true);
    });

    it('resetHistory limpia el historial al cambiar de estética', () => {
        let history = createHistory(snap({ a: 1 }, 'est-1'));
        history = pushHistory(history, snap({ a: 2 }, 'est-1'));
        history = resetHistory(snap({ b: 9 }, 'est-2'));
        assert.equal(canUndo(history), false);
        assert.equal(canRedo(history), false);
        assert.equal(history.present.id, 'est-2');
    });

    it('el snapshot es una copia: mutar el draft vivo no altera el pasado', () => {
        const live = snap({ nested: { value: 1 } });
        let history = createHistory(live);
        history = pushHistory(history, snap({ nested: { value: 2 } }));
        (live.overrides.nested as { value: number }).value = 99;
        history = undoHistory(history);
        assert.deepEqual(history.present.overrides, { nested: { value: 1 } });
    });
});

describe('atajos: no interferir con edición de texto nativa', () => {
    it('detecta input, textarea, select y contenteditable', () => {
        const asTarget = (value: unknown) => value as EventTarget;
        assert.equal(isNativeTextEditingTarget(null), false);
        assert.equal(isNativeTextEditingTarget(asTarget({ tagName: 'INPUT', isContentEditable: false })), true);
        assert.equal(isNativeTextEditingTarget(asTarget({ tagName: 'TEXTAREA', isContentEditable: false })), true);
        assert.equal(isNativeTextEditingTarget(asTarget({ tagName: 'SELECT', isContentEditable: false })), true);
        assert.equal(isNativeTextEditingTarget(asTarget({ tagName: 'DIV', isContentEditable: true })), true);
        assert.equal(isNativeTextEditingTarget(asTarget({
            tagName: 'SPAN',
            isContentEditable: false,
            closest: (selector: string) => selector.includes('input') ? {} : null,
        })), true);
        assert.equal(isNativeTextEditingTarget(asTarget({
            tagName: 'BUTTON',
            isContentEditable: false,
            closest: () => null,
        })), false);
    });
});
