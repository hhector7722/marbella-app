import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { isStudioNoise, listAppSourceFiles, measureImpact, toPosix } from '../visual-studio/impact.ts';
import type { StudioElement } from '../visual-studio/types.ts';
import type { AuditHit, AuditReport } from './schema.ts';

export function auditElement(element: StudioElement, repoRoot = process.cwd()): AuditReport {
    const conformingFiles = measureImpact(element.id, repoRoot).files;
    const pending: AuditHit[] = [];

    if (element.legacyPatterns && element.legacyPatterns.length > 0) {
        for (const full of listAppSourceFiles(repoRoot)) {
            const rel = toPosix(relative(repoRoot, full));
            if (isStudioNoise(rel)) continue;
            if (element.sourceFiles.some((file) => rel.endsWith(file) || rel === file)) continue;
            const source = readFileSync(full, 'utf8');
            const usesPrimitive = element.impactPatterns.some((pattern) => source.includes(pattern));
            const hasLegacy = element.legacyPatterns.some((pattern) => source.includes(pattern));
            if (hasLegacy && !usesPrimitive) {
                pending.push({
                    file: rel,
                    reason: `DEUDA DE IMPLEMENTACIÓN: huella nativa/local fuera de ${element.label}`,
                });
            }
        }
    }

    return {
        elementId: element.id,
        conforming: conformingFiles.length,
        pending: pending.slice(0, 40),
    };
}
