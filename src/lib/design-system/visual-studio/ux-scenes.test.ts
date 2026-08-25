import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { STUDIO_ELEMENTS } from './catalog.ts';
import { formatStudioStamp, humanDebtLead, humanImpactLead } from './ux-copy.ts';
import {
    LOOK_SHORTCUTS,
    STUDIO_REGIONS,
    STUDIO_SCENES,
    canDesignInPrimaryPath,
    defaultSceneForElement,
    lookShortcutValid,
    resolveSceneTarget,
} from './ux-scenes.ts';

const STUDIO_UI = join(process.cwd(), 'src/app/design-system/_components/DesignSystemStudio.tsx');
const SCENE_UI = join(process.cwd(), 'src/app/design-system/_components/studio-scene.tsx');

describe('Design System Studio — escenas', () => {
    it('el atajo Look solo apunta a properties que existen', () => {
        assert.equal(LOOK_SHORTCUTS.length >= 3 && LOOK_SHORTCUTS.length <= 4, true);
        for (const shortcut of LOOK_SHORTCUTS) {
            assert.equal(lookShortcutValid(shortcut), true, `${shortcut.id} no existe en el catálogo`);
        }
        assert.equal(
            LOOK_SHORTCUTS.some((item) => item.elementId === 'button' && item.propertyId === 'radius'),
            true
        );
        assert.equal(
            LOOK_SHORTCUTS.some((item) => item.elementId === 'page-header' && item.propertyId === 'py'),
            true
        );
        assert.equal(
            LOOK_SHORTCUTS.some((item) => item.elementId === 'radio-segmented' && item.propertyId === 'density'),
            true
        );
        assert.equal(
            LOOK_SHORTCUTS.some((item) => item.elementId === 'field' && item.propertyId === 'height'),
            true
        );
    });

    it('los contextos de escena cubren listado, detalle, formulario, modal y tabla', () => {
        assert.deepEqual(
            STUDIO_SCENES.map((item) => item.label),
            ['Listado', 'Detalle', 'Formulario', 'Modal', 'Tabla']
        );
        assert.equal(defaultSceneForElement('table-header'), 'table');
        assert.equal(resolveSceneTarget('table-header'), 'table');
        assert.equal(defaultSceneForElement('field'), 'form');
        assert.equal(defaultSceneForElement('modal-header'), 'modal');
    });

    it('la vía principal no ofrece fundamentos ni piezas locked vacías', () => {
        const color = STUDIO_ELEMENTS.find((item) => item.id === 'color');
        const modal = STUDIO_ELEMENTS.find((item) => item.id === 'modal');
        const button = STUDIO_ELEMENTS.find((item) => item.id === 'button');
        const field = STUDIO_ELEMENTS.find((item) => item.id === 'field');
        assert.ok(color && modal && button && field);
        assert.equal(canDesignInPrimaryPath(color), false);
        assert.equal(canDesignInPrimaryPath(modal), false);
        assert.equal(canDesignInPrimaryPath(button), true);
        assert.equal(canDesignInPrimaryPath(field), true);
        assert.equal(
            STUDIO_REGIONS.some((region) => region.elementId === 'color'),
            false
        );
        assert.equal(
            STUDIO_REGIONS.some((region) => region.elementId === 'typography'),
            false
        );
    });

    it('el impacto habla de sitios y pantallas, no de elementos-fichero', () => {
        const button = STUDIO_ELEMENTS.find((item) => item.id === 'button');
        assert.ok(button);
        const lead = humanImpactLead(button, {
            elementId: 'button',
            consumers: 12,
            routes: 4,
            variants: 2,
            files: [],
            undetermined: false,
        });
        assert.match(lead, /12 sitios/);
        assert.equal(lead.includes('elementos'), false);
        assert.equal(humanDebtLead(3), '3 sitios todavía no la usan. No van a cambiar solos.');
        assert.equal(humanDebtLead(0), null);
        assert.equal(formatStudioStamp('2026-08-26T09:15:00.000Z'), '26/08/2026 09:15');
        assert.equal(formatStudioStamp('2026-08-26'), '26/08/2026');
    });

    it('la casa es una escena, no un catálogo', () => {
        const studio = readFileSync(STUDIO_UI, 'utf8');
        const scene = readFileSync(SCENE_UI, 'utf8');
        assert.match(studio, /Toca lo que quieras cambiar/);
        assert.match(studio, /Guardar ensayo/);
        assert.match(studio, /Hacer oficial/);
        assert.match(studio, /Información técnica/);
        assert.match(studio, /Mantén pulsado para ver lo oficial/);
        assert.match(scene, /Mantén pulsado para ver lo oficial|data-peeking|Estudio/);
        assert.doesNotMatch(studio, /FOUNDATIONS/);
        assert.doesNotMatch(studio, /COMPONENTS/);
        assert.doesNotMatch(studio, /PATTERNS/);
        assert.doesNotMatch(studio, /COMPOSITIONS/);
        assert.doesNotMatch(studio, /PROPOSALS/);
        assert.doesNotMatch(studio, /Guardar como canon/);
        assert.doesNotMatch(studio, /¿Qué quieres cambiar\?/);
        assert.doesNotMatch(studio, /Guardar propuesta/);
        assert.doesNotMatch(studio, /UX_HOME_FAMILIES/);
    });
});
