import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { seedRegistryElements } from '../visual-studio/catalog.ts';
import { canWriteCanon } from '../visual-studio/git-history.ts';
import type { CanonRegistry, ProposalStore, StudioSnapshot } from './schema.ts';

export function canonDir(repoRoot = process.cwd()): string {
    return join(repoRoot, 'src/lib/design-system/canon');
}

export function registryPath(repoRoot = process.cwd()): string {
    return join(canonDir(repoRoot), 'registry.json');
}

export function proposalsPath(repoRoot = process.cwd()): string {
    return join(canonDir(repoRoot), 'proposals.json');
}

export function emptyRegistry(): CanonRegistry {
    return {
        source: 'marbella-visual-canon',
        updatedAt: '1970-01-01',
        elements: seedRegistryElements(),
        history: [],
    };
}

export function loadRegistry(repoRoot = process.cwd()): CanonRegistry {
    const path = registryPath(repoRoot);
    if (!existsSync(path)) return emptyRegistry();
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as CanonRegistry;
    const seeded = emptyRegistry();
    return {
        source: 'marbella-visual-canon',
        updatedAt: parsed.updatedAt ?? seeded.updatedAt,
        history: parsed.history ?? [],
        elements: { ...seeded.elements, ...parsed.elements },
    };
}

export function loadProposals(repoRoot = process.cwd()): ProposalStore {
    const path = proposalsPath(repoRoot);
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, 'utf8')) as ProposalStore;
}

export function writeRegistry(registry: CanonRegistry, repoRoot = process.cwd()): void {
    const path = registryPath(repoRoot);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`);
}

export function writeProposals(store: ProposalStore, repoRoot = process.cwd()): void {
    const path = proposalsPath(repoRoot);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
}

export function loadStudioSnapshot(repoRoot = process.cwd()): StudioSnapshot {
    const writable = canWriteCanon(repoRoot);
    return {
        registry: loadRegistry(repoRoot),
        proposals: loadProposals(repoRoot),
        writable: writable.ok,
        writableReason: writable.reason,
    };
}
