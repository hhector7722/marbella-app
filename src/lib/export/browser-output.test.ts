import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const SRC = join(process.cwd(), 'src');

const SHARE_SURFACES = [
    'app/dashboard/history/page.tsx',
    'app/dashboard/movements/page.tsx',
    'app/dashboard/ventas/page.tsx',
    'components/dashboards/SubNavVentas.tsx',
    'app/staff/history/page.tsx',
] as const;

const TABLE_EXPORT_SURFACES = [
    'app/dashboard/history/page.tsx',
    'app/dashboard/movements/page.tsx',
    'app/dashboard/ventas/page.tsx',
] as const;

describe('exportaciones Excel / PDF / impresión', () => {
    it('los menús de compartir no cierran el Modal con pointerdown en captura', () => {
        for (const rel of SHARE_SURFACES) {
            const src = readFileSync(join(SRC, rel), 'utf8');
            assert.doesNotMatch(
                src,
                /addEventListener\('pointerdown'/,
                `${rel}: el listener de captura desmonta el Modal antes del clic`,
            );
        }
    });

    it('Cierres, Tesorería y Ventas imprimen con el contenedor de página, no con iframe', () => {
        for (const rel of TABLE_EXPORT_SURFACES) {
            const src = readFileSync(join(SRC, rel), 'utf8');
            assert.match(src, /printHtml/, `${rel} debe usar printHtml`);
            assert.doesNotMatch(
                src,
                /iframe\.contentWindow\?\.print/,
                `${rel} no debe imprimir con iframe oculto`,
            );
        }
    });

    it('las descargas Excel no usan XLSX.writeFile', () => {
        const files = [
            ...TABLE_EXPORT_SURFACES,
            'lib/staff/timesheet-xlsx.ts',
            'lib/export/browser-output.ts',
        ];
        for (const rel of files) {
            const src = readFileSync(join(SRC, rel), 'utf8');
            assert.doesNotMatch(
                src,
                /XLSX\.writeFile\(/,
                `${rel} no debe usar writeFile (FileSaver falla en Safari/PWA)`,
            );
        }
    });
});
