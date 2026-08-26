import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { STUDIO_ELEMENTS } from './catalog.ts';
import { formatStudioStamp, humanDebtLead, humanImpactLead } from './ux-copy.ts';
import { canDesignInPrimaryPath, defaultSceneForElement, resolveSceneTarget } from './ux-scenes.ts';
import { STYLE_TYPES, styleTypeForParam, styleTypeValid } from './ux-styles.ts';

const STUDIO_UI = join(process.cwd(), 'src/app/design-system/_components/DesignSystemStudio.tsx');

describe('Design System Studio — estilos globales', () => {
    it('cada tipo apunta a una pieza y properties que existen', () => {
        assert.equal(STYLE_TYPES.length >= 7, true);
        for (const style of STYLE_TYPES) {
            assert.equal(styleTypeValid(style), true, `${style.id} no encaja con el catálogo`);
        }
        assert.equal(
            STYLE_TYPES.some((item) => item.id === 'page-header' && item.elementId === 'page-header'),
            true
        );
        assert.equal(
            STYLE_TYPES.some((item) => item.id === 'modal-header' && item.elementId === 'modal-header'),
            true
        );
        assert.equal(
            STYLE_TYPES.filter((item) => item.elementId === 'button').map((item) => item.buttonVariant).join(','),
            'primary,secondary,tertiary,destructive'
        );
    });

    it('PageScreen y Modal son palancas distintas', () => {
        const page = STYLE_TYPES.find((item) => item.id === 'page-header');
        const modal = STYLE_TYPES.find((item) => item.id === 'modal-header');
        assert.ok(page && modal);
        assert.notEqual(page.elementId, modal.elementId);
        assert.equal(page.preview, 'page');
        assert.equal(modal.preview, 'modal');
        const header = STUDIO_ELEMENTS.find((item) => item.id === 'modal-header');
        assert.ok(header);
        assert.equal(header.applyKind, 'css-contract');
        assert.equal(
            header.properties.some((property) => property.id === 'height'),
            true
        );
    });

    it('el botón de filtro no promete TimeFilter ni el selector', () => {
        const filter = STYLE_TYPES.find((item) => item.id === 'button-filter');
        const selector = STYLE_TYPES.find((item) => item.id === 'selector');
        assert.ok(filter && selector);
        assert.equal(filter.elementId, 'button');
        assert.match(filter.blurb, /No es el selector/);
        assert.equal(filter.ripple.includes('TimeFilter'), false);
        assert.equal(selector.decided, true);
        assert.match(selector.decidedCopy ?? '', /No es un botón/);
        assert.equal(styleTypeForParam('timefilter-chrome').id, 'selector');
        assert.equal(styleTypeForParam('button').id, 'button-save');
        assert.equal(styleTypeForParam('pagescreen').id, 'page-header');
    });

    it('los contextos de escena siguen resolviendo destinos técnicos', () => {
        assert.equal(defaultSceneForElement('table-header'), 'table');
        assert.equal(resolveSceneTarget('table-header'), 'table');
        assert.equal(defaultSceneForElement('field'), 'form');
        assert.equal(defaultSceneForElement('modal-header'), 'modal');
    });

    it('la vía principal no ofrece fundamentos ni el Modal como pieza hueca', () => {
        const color = STUDIO_ELEMENTS.find((item) => item.id === 'color');
        const modal = STUDIO_ELEMENTS.find((item) => item.id === 'modal');
        const button = STUDIO_ELEMENTS.find((item) => item.id === 'button');
        const field = STUDIO_ELEMENTS.find((item) => item.id === 'field');
        const modalHeader = STUDIO_ELEMENTS.find((item) => item.id === 'modal-header');
        assert.ok(color && modal && button && field && modalHeader);
        assert.equal(canDesignInPrimaryPath(color), false);
        assert.equal(canDesignInPrimaryPath(modal), false);
        assert.equal(canDesignInPrimaryPath(button), true);
        assert.equal(canDesignInPrimaryPath(field), true);
        assert.equal(canDesignInPrimaryPath(modalHeader), true);
        assert.equal(
            STYLE_TYPES.some((item) => item.elementId === 'color'),
            false
        );
        assert.equal(
            STYLE_TYPES.some((item) => item.elementId === 'typography'),
            false
        );
    });

    it('el impacto habla de plantilla, modales y deuda clonada', () => {
        const button = STUDIO_ELEMENTS.find((item) => item.id === 'button');
        const page = STUDIO_ELEMENTS.find((item) => item.id === 'page-header');
        assert.ok(button && page);
        const buttonLead = humanImpactLead(button, {
            elementId: 'button',
            consumers: 12,
            routes: 4,
            variants: 2,
            files: [],
            undetermined: false,
        });
        assert.match(buttonLead, /12 sitios/);
        assert.match(buttonLead, /no son botones/);
        assert.equal(buttonLead.includes('TimeFilter'), false);
        assert.equal(buttonLead.includes('elementos'), false);
        const pageLead = humanImpactLead(page, {
            elementId: 'page-header',
            consumers: 8,
            routes: 8,
            variants: 1,
            files: [],
            undetermined: false,
        });
        assert.match(pageLead, /plantilla/);
        assert.match(pageLead, /clonadas/);
        assert.equal(humanDebtLead(3), '3 sitios todavía no la usan. No van a cambiar solos.');
        assert.equal(humanDebtLead(0), null);
        assert.equal(formatStudioStamp('2026-08-26T09:15:00.000Z'), '26/08/2026 09:15');
        assert.equal(formatStudioStamp('2026-08-26'), '26/08/2026');
    });

    it('la entrada es Estilos de Marbella, no una casa ni un catálogo', () => {
        const studio = readFileSync(STUDIO_UI, 'utf8');
        assert.match(studio, /Estilos de Marbella/);
        assert.match(studio, /Un tipo, toda la app/);
        assert.match(studio, /Guardar ensayo/);
        assert.match(studio, /Hacer oficial/);
        assert.match(studio, /Información técnica/);
        assert.match(studio, /Volver a los estilos/);
        assert.doesNotMatch(studio, /Toca lo que quieras cambiar/);
        assert.doesNotMatch(studio, /FOUNDATIONS/);
        assert.doesNotMatch(studio, /COMPONENTS/);
        assert.doesNotMatch(studio, /PATTERNS/);
        assert.doesNotMatch(studio, /COMPOSITIONS/);
        assert.doesNotMatch(studio, /PROPOSALS/);
        assert.doesNotMatch(studio, /Guardar como canon/);
        assert.doesNotMatch(studio, /¿Qué quieres cambiar\?/);
        assert.doesNotMatch(studio, /Guardar propuesta/);
        assert.doesNotMatch(studio, /UX_HOME_FAMILIES/);
        assert.doesNotMatch(studio, /LOOK_SHORTCUTS/);
        assert.doesNotMatch(studio, /StudioLivingScene/);
    });
});
