import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const modal = readFileSync(resolve(import.meta.dirname, '../../components/modals/StaffScheduleModal.tsx'), 'utf8');

describe('Cabecera de horario: navegación diaria', () => {
    it('ambas flechas avanzan un solo día en lectura y edición', () => {
        assert.match(modal, /navigateSelectedDay\(-1\)/);
        assert.match(modal, /navigateSelectedDay\(1\)/);
        assert.match(modal, /navigateEditingDay\(-1\)/);
        assert.match(modal, /navigateEditingDay\(1\)/);
        assert.match(modal, /aria-label=\{selectedDate \? 'Día anterior' : 'Mes anterior'\}/);
        assert.match(modal, /aria-label=\{selectedDate \? 'Día siguiente' : 'Mes siguiente'\}/);
        assert.match(modal, /const next = new Date\(selectedDate\.getFullYear\(\), selectedDate\.getMonth\(\), selectedDate\.getDate\(\) \+ delta\)/);
    });

    it('el calendario mensual se abre pulsando la fecha, no con las flechas del día', () => {
        assert.match(modal, /aria-label=\{editModeForDate \? 'Salir de edición' : 'Volver al calendario mensual'\}/);
        assert.match(modal, /else handleBack\(\)/);
        assert.match(modal, /navigateMonth\(-1\)/);
        assert.match(modal, /navigateMonth\(1\)/);
    });

    it('el cálculo de día cruza correctamente meses, años y años bisiestos', () => {
        const shift = (date: Date, delta: -1 | 1) =>
            new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
        const ymd = (date: Date) =>
            [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

        assert.equal(ymd(shift(new Date(2026, 10, 15), -1)), '2026-11-14');
        assert.equal(ymd(shift(new Date(2026, 10, 14), -1)), '2026-11-13');
        assert.equal(ymd(shift(new Date(2026, 10, 30), 1)), '2026-12-01');
        assert.equal(ymd(shift(new Date(2026, 0, 1), -1)), '2025-12-31');
        assert.equal(ymd(shift(new Date(2024, 1, 28), 1)), '2024-02-29');
    });
});
