import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

import {
    LEGACY_PARALLEL_OVERLAY_ALLOWLIST,
    OFFICIAL_OVERLAY_HOSTS,
} from './overlay-parallel-allowlist.ts';
import {
    hasParallelOverlayFingerprint,
    usesOfficialOverlayImport,
} from './overlay-parallel.ts';

const REPO_ROOT = process.cwd();
const SRC_ROOT = join(REPO_ROOT, 'src');

const SOURCE_EXT = new Set(['.tsx', '.ts', '.jsx', '.js']);

function toPosix(path: string): string {
    return path.split('\\').join('/');
}

function listSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            listSourceFiles(full, acc);
            continue;
        }
        const dot = entry.lastIndexOf('.');
        if (dot < 0) continue;
        if (!SOURCE_EXT.has(entry.slice(dot))) continue;
        if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue;
        acc.push(full);
    }
    return acc;
}

describe('Huella de overlay paralelo', () => {
    it('detecta un overlay ad hoc típico y no un simple fixed', () => {
        assert.equal(
            hasParallelOverlayFingerprint(
                '<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">'
            ),
            true
        );
        assert.equal(
            hasParallelOverlayFingerprint('<div className="fixed top-0 left-0 z-10">'),
            false
        );
        assert.equal(
            usesOfficialOverlayImport("import { Modal } from '@/components/ui/modal';"),
            true
        );
        assert.equal(
            usesOfficialOverlayImport(
                "import { ConsumptionBottomSheet } from '@/components/ui/ConsumptionBottomSheet';"
            ),
            true
        );
    });
});

describe('No hay overlays paralelos nuevos', () => {
    const official = new Set<string>(OFFICIAL_OVERLAY_HOSTS);
    const allowlist = new Set<string>(LEGACY_PARALLEL_OVERLAY_ALLOWLIST);

    it('cada ruta de la allowlist existe y sigue disparando la huella', () => {
        for (const rel of LEGACY_PARALLEL_OVERLAY_ALLOWLIST) {
            const source = readFileSync(join(REPO_ROOT, rel), 'utf8');
            assert.equal(
                hasParallelOverlayFingerprint(source),
                true,
                `${rel} está en la allowlist pero ya no dispara la huella: retíralo de overlay-parallel-allowlist.ts`
            );
        }
    });

    it('oficiales y allowlist no se solapan', () => {
        for (const rel of OFFICIAL_OVERLAY_HOSTS) {
            assert.equal(allowlist.has(rel), false, `${rel} no debe estar en la allowlist`);
        }
    });

    it('ningún fichero nuevo fuera de hosts oficiales y allowlist dispara la huella', () => {
        const offenders: string[] = [];
        for (const full of listSourceFiles(SRC_ROOT)) {
            const rel = toPosix(relative(REPO_ROOT, full));
            if (official.has(rel) || allowlist.has(rel)) continue;
            const source = readFileSync(full, 'utf8');
            if (!hasParallelOverlayFingerprint(source)) continue;
            offenders.push(rel);
        }
        assert.deepEqual(
            offenders,
            [],
            `Overlay paralelo nuevo. Usa Modal (@/components/ui/modal) o ConsumptionBottomSheet.\n${offenders.join('\n')}`
        );
    });
});
