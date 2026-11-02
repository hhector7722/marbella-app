import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, it } from 'node:test';
import ts from 'typescript';

const source = readFileSync(resolve(import.meta.dirname, '../fichaje-overlay-videos.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleScope: {
    exports: Record<string, unknown>;
    require: (name: string) => unknown;
} = {
    exports: {},
    require(name) {
        assert.equal(name, '@/lib/public-storage');
        return { manualesVideoUrl: (path: string) => `/manuales/${path}` };
    },
};
runInNewContext(compiled, moduleScope);

const getVideos = moduleScope.exports.getFichajeOverlayVideos as (
    email: string, madridDayYmd: string,
) => { entrada: string; salida: string } | undefined;

describe('Vídeos tras fichaje (entrada y salida)', () => {
    it('Fernando mantiene davoo.mp4 todos los días', () => {
        for (const date of ['2026-11-01', '2026-11-02', '2026-11-03']) {
            const videos = getVideos('fggutierrez98es@gmail.com', date);
            assert.equal(videos?.entrada, '/manuales/fichaje/davoo.mp4');
            assert.equal(videos?.salida, '/manuales/fichaje/davoo.mp4');
        }
    });

    it('Héctor ve davoo.mp4 solo el 2 de noviembre, según la fecha de Madrid', () => {
        const today = getVideos('hhector7722@gmail.com', '2026-11-02');
        assert.equal(today?.entrada, '/manuales/fichaje/davoo.mp4');
        assert.equal(today?.salida, '/manuales/fichaje/davoo.mp4');

        for (const date of ['2026-11-01', '2026-11-03']) {
            const videos = getVideos('hhector7722@gmail.com', date);
            assert.equal(videos?.entrada, '/manuales/fichaje/video-espana.mp4');
            assert.equal(videos?.salida, '/manuales/fichaje/video-espana.mp4');
        }
    });

    it('mantiene intactos los demás trabajadores y normaliza el correo', () => {
        const videos = getVideos('  ALBAMASIA.OPOS@GMAIL.COM  ', '2026-11-02');
        assert.equal(videos?.entrada, '/manuales/fichaje/cr7.mp4');
        assert.equal(videos?.salida, '/manuales/fichaje/cris.mp4');
    });
});