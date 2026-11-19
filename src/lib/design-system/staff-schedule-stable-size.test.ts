import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const sourceRoot = resolve(import.meta.dirname, '../..');
const css = readFileSync(resolve(sourceRoot, 'app/globals.css'), 'utf8');
const modal = readFileSync(resolve(sourceRoot, 'components/modals/StaffScheduleModal.tsx'), 'utf8');

describe('Horario: altura dinámica en vista diaria y editor', () => {
    it('conserva la altura fija del calendario mensual y permite edición', () => {
        assert.match(
            css,
            /\[data-component='Modal'\]\[data-instance='staff-schedule'\] \[data-element='container'\]\s*\{\s*height:\s*min\(680px,\s*var\(--modal-max-height\)\)\s*!important;/,
        );
        assert.match(modal, /instance="staff-schedule"/);
        assert.match(modal, /variant="day"/);
        assert.match(modal, /!dayShellReady \? \(/);
        assert.match(modal, /editModeForDate \? \(/);
    });

    it('limita la altura por viewport y desplaza el cuerpo del modal de día y editor', () => {
        assert.match(css, /--modal-max-height:\s*calc\(/);
        assert.match(modal, /scrollContent=\{Boolean\(selectedDate \|\| editModeForDate\)\}/);
        assert.match(modal, /editModeForDate && "schedule-editing-mode"/);
    });

    it('la vista diaria muestra todas las filas y desplaza el cuerpo del modal', () => {
        assert.match(modal, /selectedDate && !editModeForDate && "schedule-day-readonly"/);
        assert.match(modal, /day-modal-body day-modal-readonly/);
        assert.match(modal, /flex w-full flex-col flex-none bg-white day-modal-shift-rows/);
        assert.match(modal, /data-element="schedule-notes-inline"[\s\S]*?<ScheduleNotesFooter/);
        assert.doesNotMatch(modal, /footer=\{[\s\S]*?<ScheduleNotesFooter/);
        assert.match(css, /\.schedule-day-readonly \[data-element='container'\] \{\s*height: auto !important;/);
        assert.match(css, /\.schedule-day-readonly \.day-modal-shift-rows \{[\s\S]*?overflow-y: visible !important;/);
    });
    it('compacta totales/costes y ajusta el avatar a la línea del nombre', () => {
        assert.match(modal, /schedule-employee-avatar/);
        assert.match(css, /schedule-hour-totals'\] > \* \{\s*height: 1\.5rem !important;/);
        assert.match(css, /schedule-labor-summary'\] > div \{[\s\S]*?padding-bottom: 3px !important;/);
        assert.match(css, /\.day-modal-readonly \.schedule-employee-avatar \{\s*width: 11px !important;\s*height: 11px !important;/);
    });
    it('el editor ajusta su tabla al contenido y evita su scroll interior', () => {
        assert.match(modal, /flex w-full flex-none flex-col min-h-0 day-modal-body/);
        assert.match(css, /\.schedule-editing-mode\s+\[data-element='container'\] \{\s*height: auto !important;/);
        assert.match(css, /\.schedule-editing-mode\s+\[data-element='body'\] \{\s*overflow-y: auto !important;/);
        assert.match(css, /\.schedule-editing-mode\s+\.day-modal-shift-rows \{\s*overflow-x: hidden !important;\s*overflow-y: visible !important;/);
    });
});
