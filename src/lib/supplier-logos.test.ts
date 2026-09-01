import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { getSupplierLogo, SUPPLIER_LOGO_REV, SUPPLIER_LOGOS } from './supplier-logos.ts';

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), '../../public');

describe('getSupplierLogo', () => {
    it('el pack local gana a una image_url de BD', () => {
        const src = getSupplierLogo('https://cdn.example/old.png', 'Ametller');
        assert.equal(src, `/icons/prov/Ametller.png?v=${SUPPLIER_LOGO_REV}`);
    });

    it('encaja sin acentos ni mayúsculas', () => {
        const src = getSupplierLogo(null, 'cárnicas pijuan');
        assert.equal(src, `/icons/prov/Pijuan.png?v=${SUPPLIER_LOGO_REV}`);
    });

    it('encaja un alias corto', () => {
        const src = getSupplierLogo(null, 'Pijuan');
        assert.equal(src, `/icons/prov/Pijuan.png?v=${SUPPLIER_LOGO_REV}`);
    });

    it('sin pack usa la foto de BD', () => {
        assert.equal(getSupplierLogo('https://cdn.example/mio.png', 'Proveedor Nuevo'), 'https://cdn.example/mio.png');
    });

    it('sin pack ni foto no inventa URL', () => {
        assert.equal(getSupplierLogo(null, 'Desconocido'), null);
    });

    it('todos los logos del mapa existen en public/icons/prov', () => {
        for (const path of Object.values(SUPPLIER_LOGOS)) {
            assert.match(path, /^\/icons\/prov\/.+\.png$/);
            assert.equal(existsSync(join(publicRoot, path)), true, path);
        }
    });
});
