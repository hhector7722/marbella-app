import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const sourceRoot = resolve(import.meta.dirname, '../..');
const css = readFileSync(resolve(sourceRoot, 'app/globals.css'), 'utf8');
const modal = readFileSync(resolve(sourceRoot, 'components/modals/StaffScheduleModal.tsx'), 'utf8');

describe('Horario: tamaño constante del modal', () => {
    it('fija la altura del panel para carga, navegación y modo edición', () => {
        assert.match(
            css,
            /\[data-component='Modal'\]\[data-instance='staff-schedule'\] \[data-element='container'\]\s*\{\s*height:\s*min\(680px,\s*var\(--modal-max-height\)\)\s*!important;/,
        );
        assert.match(modal, /instance="staff-schedule"/);
        assert.match(modal, /variant="day"/);
        assert.match(modal, /!dayShellReady \? \(/);
        assert.match(modal, /editModeForDate \? \(/);
    });

    it('mantiene altura limitada por viewport y contenido interior flexible', () => {
        assert.match(css, /--modal-max-height:\s*calc\(/);
        assert.match(modal, /scrollContent=\{false\}/);
        assert.match(modal, /flex flex-col flex-1 overflow-hidden min-h-0 day-modal-body/);
    });
});
