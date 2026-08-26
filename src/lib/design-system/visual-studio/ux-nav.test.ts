import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { HEIGHT_OPTIONS, RADIUS_OPTIONS, findOption } from './allowed-values.ts';
import { STUDIO_ELEMENTS } from './catalog.ts';
import { humanOptionLabel, humanTitle, uxStatusOf } from './ux-copy.ts';
import {
    UX_COVERED_BY,
    UX_FAMILIES,
    UX_HEADER_TYPES,
    UX_HOME_FAMILIES,
    unmappedCatalogIds,
} from './ux-nav.ts';

const STUDIO_UI = join(process.cwd(), 'src/app/design-system/_components/DesignSystemStudio.tsx');

describe('Design System Studio — UX de decisión visual', () => {
    it('cubre todo el catálogo sin inventar familias vacías', () => {
        assert.deepEqual(unmappedCatalogIds(), []);
        for (const family of UX_FAMILIES) {
            assert.ok(family.elementIds.length > 0, `${family.id} no tiene elementos`);
            for (const id of family.elementIds) {
                assert.ok(
                    STUDIO_ELEMENTS.some((item) => item.id === id),
                    `${family.id} apunta a ${id}, que no está en el catálogo`
                );
            }
        }
    });

    it('la entrada habla de lo que se quiere cambiar, no de arquitectura', () => {
        const homeLabels = UX_HOME_FAMILIES.map((item) => item.label);
        assert.deepEqual(homeLabels, [
            'Botones',
            'Campos',
            'Cabeceras',
            'Modales',
            'Tarjetas / bloques',
            'Tablas',
            'Filtros',
            'Espaciado',
            'Tipografía',
            'Colores',
        ]);
        const studio = readFileSync(STUDIO_UI, 'utf8');
        assert.match(studio, /Estilos de Marbella/);
        assert.doesNotMatch(studio, /FOUNDATIONS/);
        assert.doesNotMatch(studio, /COMPONENTS/);
        assert.doesNotMatch(studio, /PATTERNS/);
        assert.doesNotMatch(studio, /COMPOSITIONS/);
        assert.doesNotMatch(studio, /PROPOSALS/);
        assert.doesNotMatch(studio, /Guardar como canon/);
        assert.match(studio, /Hacer oficial/);
        assert.match(studio, /Guardar ensayo/);
        assert.match(studio, /Información técnica/);
    });

    it('cabeceras se eligen por tipo humano y derived no es un tipo', () => {
        assert.deepEqual(
            UX_HEADER_TYPES.map((item) => item.label),
            ['Página', 'Tarjeta / bloque', 'Modal', 'Tabla']
        );
        assert.equal(UX_COVERED_BY['derived-modal-header'], 'modal-header');
        assert.equal(
            UX_HEADER_TYPES.some((item) => item.id === 'derived-modal-header'),
            false
        );
        const table = UX_HEADER_TYPES.find((item) => item.id === 'table-header');
        assert.equal(table?.targetId, 'table');
    });

    it('las etiquetas de control no exponen tokens ni hex', () => {
        const height = findOption(HEIGHT_OPTIONS, 'tactil.minimo');
        const radius = findOption(RADIUS_OPTIONS, 'espacio.2');
        assert.ok(height);
        assert.ok(radius);
        assert.equal(humanOptionLabel(height), '48 px');
        assert.equal(humanOptionLabel(radius), '8 px');
        assert.equal(humanOptionLabel(height).includes('tactil'), false);
        assert.equal(humanOptionLabel(radius).includes('espacio'), false);
        assert.equal(humanTitle('petroleum-segmented'), 'Selector de opciones');
        const button = STUDIO_ELEMENTS.find((item) => item.id === 'button');
        assert.ok(button);
        assert.equal(uxStatusOf(button), 'oficial');
    });
});
