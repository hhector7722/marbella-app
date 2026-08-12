import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { COMPOSITION_KEYS, compositionAttributes, expandLegacyComposition } from './composition.ts';
import type { VisualOverride } from './types.ts';

// El componente y su caja de icono son ámbitos distintos: cada uno guarda
// su propio override. Una composición se describe con los dos.
type Composicion = {
    componente: VisualOverride;
    caja?: VisualOverride;
    texto?: VisualOverride;
};

describe('composiciones A-G representables con propiedades independientes', () => {
    it('A · icono solo', () => {
        const { componente }: Composicion = {
            componente: { showText: false, layoutDirection: 'vertical' },
        };
        const attributes = compositionAttributes(componente);
        assert.equal(attributes.hideText, true);
        assert.equal(attributes.hideIcon, undefined, 'ocultar el texto no oculta el icono');
        assert.equal(attributes.layout, 'vertical');
    });

    it('B · icono + texto dentro de la misma caja: la superficie es del componente', () => {
        const { componente, caja }: Composicion = {
            componente: { layoutDirection: 'vertical', layoutAlign: 'center', tone: 'custom', backgroundColor: '#ffffff', gap: '4px' },
            caja: { iconBoxMode: 'none' },
        };
        assert.deepEqual(compositionAttributes(componente), { layout: 'vertical', align: 'center' });
        assert.equal(componente.backgroundColor, '#ffffff', 'el fondo pertenece al componente');
        assert.equal(compositionAttributes(caja!).iconBox, 'none', 'la caja no pinta nada');
    });

    it('C · caja de icono con superficie + texto fuera de ella', () => {
        const { componente, caja }: Composicion = {
            componente: { layoutDirection: 'vertical', layoutAlign: 'center', tone: 'transparent', borderWidth: '0px', boxShadow: 'none' },
            caja: { iconBoxMode: 'box', tone: 'custom', backgroundColor: '#ffffff', iconBoxCorner: '16px' },
        };
        assert.equal(componente.tone, 'transparent', 'el componente no aporta superficie');
        assert.equal(componente.borderWidth, '0px');
        assert.equal(compositionAttributes(caja!).iconBox, 'box');
        assert.equal(caja!.backgroundColor, '#ffffff', 'la superficie es exclusivamente de la caja');
        assert.equal(caja!.showText, undefined, 'la caja no decide nada sobre el texto');
    });

    it('D · icono sin caja + texto: ninguna pieza tiene recuadro', () => {
        const { componente, caja }: Composicion = {
            componente: { layoutDirection: 'vertical', tone: 'transparent', borderWidth: '0px', boxShadow: 'none' },
            caja: { iconBoxMode: 'none' },
        };
        assert.equal(compositionAttributes(caja!).iconBox, 'none');
        assert.equal(compositionAttributes(componente).hideText, undefined, 'el texto sigue visible');
    });

    it('E · caja y texto son ámbitos totalmente independientes', () => {
        const { caja, texto }: Composicion = {
            componente: {},
            caja: { iconBoxMode: 'square', backgroundColor: '#ffffff' },
            texto: { fontSize: '10px', textColor: '#111827', textAlign: 'center' },
        };
        // Ninguna propiedad de la caja aparece en el texto ni al contrario.
        assert.equal(caja!.fontSize, undefined);
        assert.equal(texto!.iconBoxMode, undefined);
        assert.equal(compositionAttributes(texto!).iconBox, undefined);
    });

    it('F · icono y texto en horizontal, con y sin fondo', () => {
        const conFondo: VisualOverride = { layoutDirection: 'horizontal', layoutAlign: 'start', gap: '8px', tone: 'custom', backgroundColor: '#ffffff' };
        const sinFondo: VisualOverride = { layoutDirection: 'horizontal', layoutAlign: 'start', gap: '8px', tone: 'transparent', borderWidth: '0px', boxShadow: 'none' };
        assert.equal(compositionAttributes(conFondo).layout, 'horizontal');
        assert.deepEqual(compositionAttributes(conFondo), compositionAttributes(sinFondo), 'el fondo no forma parte de la composición');
    });

    it('G · texto encima e icono debajo invirtiendo el orden', () => {
        const attributes = compositionAttributes({ layoutDirection: 'vertical', layoutOrder: 'text-icon' });
        assert.equal(attributes.order, 'text-icon');
        assert.equal(attributes.layout, 'vertical');
    });
});

describe('independencia de las piezas', () => {
    it('ocultar el texto no altera ninguna otra propiedad', () => {
        const antes: VisualOverride = { layoutDirection: 'vertical', gap: '4px', backgroundColor: '#ffffff' };
        const despues: VisualOverride = { ...antes, showText: false };
        assert.equal(despues.gap, antes.gap);
        assert.equal(despues.backgroundColor, antes.backgroundColor);
        assert.equal(despues.layoutDirection, antes.layoutDirection);
        assert.equal(compositionAttributes(despues).hideIcon, undefined);
    });

    it('quitar la caja no altera el asset ni el texto', () => {
        const caja: VisualOverride = { iconBoxMode: 'none' };
        const attributes = compositionAttributes(caja);
        assert.equal(attributes.iconBox, 'none');
        assert.equal(attributes.hideIcon, undefined, 'sin caja no significa sin icono');
        assert.equal(attributes.hideText, undefined);
        assert.equal(caja.scale, undefined, 'el asset conserva su escala');
        assert.equal(caja.width, undefined, 'el asset conserva su tamaño');
    });

    it('cambiar la caja no escribe nada del texto', () => {
        for (const mode of ['none', 'box', 'square'] as const) {
            const attributes = compositionAttributes({ iconBoxMode: mode });
            assert.equal(attributes.hideText, undefined);
            assert.equal(attributes.layout, undefined, 'la caja no decide el layout del componente');
            assert.equal(attributes.order, undefined);
        }
    });

    it('cada propiedad de composición produce exactamente un atributo', () => {
        const produced = COMPOSITION_KEYS.map(key => {
            const override = { [key]: key === 'showText' || key === 'showIcon' ? false : key === 'layoutDirection' ? 'horizontal' : key === 'layoutOrder' ? 'text-icon' : 'end' } as VisualOverride;
            return Object.keys(compositionAttributes(override));
        });
        produced.forEach(keys => assert.equal(keys.length, 1));
    });

    it('un override vacío no impone ninguna composición', () => {
        assert.deepEqual(compositionAttributes({}), {});
    });
});

describe('estéticas guardadas con los modos antiguos', () => {
    it('inside se expande a vertical, icono y texto visibles', () => {
        const expanded = expandLegacyComposition({ composition: 'inside' });
        assert.equal(expanded.layoutDirection, 'vertical');
        assert.equal(expanded.layoutOrder, 'icon-text');
        assert.equal(expanded.showText, undefined);
        assert.equal(expanded.showIcon, undefined);
    });

    it('outside vacía la superficie del componente, no la de la caja', () => {
        const expanded = expandLegacyComposition({ composition: 'outside' });
        assert.equal(expanded.tone, 'transparent');
        assert.equal(expanded.borderWidth, '0px');
        assert.equal(expanded.boxShadow, 'none');
        assert.equal(expanded.iconBoxMode, undefined, 'no decide por la caja del icono');
    });

    it('icon-only y text-only solo cambian visibilidad', () => {
        assert.equal(compositionAttributes(expandLegacyComposition({ composition: 'icon-only' })).hideText, true);
        assert.equal(compositionAttributes(expandLegacyComposition({ composition: 'text-only' })).hideIcon, true);
    });

    it('lo escrito por el usuario gana sobre la expansión del modo antiguo', () => {
        const expanded = expandLegacyComposition({ composition: 'outside', tone: 'custom', backgroundColor: '#000000', layoutDirection: 'horizontal' });
        assert.equal(expanded.tone, 'custom');
        assert.equal(expanded.layoutDirection, 'horizontal');
    });

    it('sin modo antiguo el override pasa intacto', () => {
        const override: VisualOverride = { layoutDirection: 'horizontal' };
        assert.equal(expandLegacyComposition(override), override);
    });
});
