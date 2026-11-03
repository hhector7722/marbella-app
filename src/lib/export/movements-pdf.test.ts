import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(process.cwd(), 'src');
const page = readFileSync(join(ROOT, 'app/dashboard/movements/page.tsx'), 'utf8');
const pdf = readFileSync(join(ROOT, 'lib/export/movements-pdf.ts'), 'utf8');
const filter = readFileSync(join(ROOT, 'components/time/TimeFilterModal.tsx'), 'utf8');
const calendar = readFileSync(join(ROOT, 'components/time/MiniMonthCalendar.tsx'), 'utf8');

describe('exportación y filtro de Tesorería', () => {
    it('ofrece las tres acciones independientes, sin botones de ancho completo', () => {
        assert.match(page, /Exportar Excel/);
        assert.match(page, /Exportar PDF/);
        assert.match(page, />\s*Imprimir\s*</);
        assert.doesNotMatch(page, /Imprimir \/ PDF/);
        const menu = page.split('instance="movements-share-menu"')[1] ?? '';
        assert.doesNotMatch(menu, /layout="fill"/);
        assert.match(page, /downloadMovementsPdf\(rows, period.label/);
    });

    it('el PDF es nativo y no contiene marco exterior, bloque negro ni pie', () => {
        assert.match(pdf, /fillColor: NAVY/);
        assert.doesNotMatch(pdf, /fillColor: false/);
        assert.doesNotMatch(pdf, /roundedRect\(LEFT, TABLE_Y, tableWidth/);
        assert.doesNotMatch(pdf, /\.line\(LEFT, 111,/);
        assert.doesNotMatch(pdf, /pageNumber|pageCount|footer|printHtml/);
        assert.match(page, /@page \{ size: A4 portrait; margin: 0; \}/);
        assert.match(page, /border: none; border-radius: 12px/);
        assert.match(page, /#marbella-print-container \{ padding: 16mm 14mm !important; \}/);
    });

    it('el selector oscuro permite volver al mes actual y señala siempre hoy', () => {
        assert.match(filter, /scheme="dark"/);
        assert.match(filter, /instance="time-filter-jump-today"/);
        assert.match(filter, /setCalendarBaseDate\(today\)/);
        assert.match(calendar, /aria-current=\{today \? 'date' : undefined\}/);
        assert.match(calendar, /today && 'border-2 border-white text-white'/);
    });
});
