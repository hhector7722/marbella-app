import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type HistoryEntry = {
    hash: string;
    date: string;
    subject: string;
};

export async function readGitHistory(
    files: string[],
    repoRoot = process.cwd()
): Promise<HistoryEntry[]> {
    const unique = files.filter((item, index) => files.indexOf(item) === index);
    if (unique.length === 0) {
        unique.push('marbella-os/2-diseno/BLUEPRINT-VISUAL.md');
    }
    try {
        const { stdout } = await execFileAsync(
            'git',
            ['log', '-12', '--date=short', '--pretty=format:%h|%ad|%s', '--', ...unique],
            { cwd: repoRoot, timeout: 8000 }
        );
        return stdout
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const [hash, date, ...rest] = line.split('|');
                return {
                    hash: hash ?? '',
                    date: date ?? '',
                    subject: rest.join('|'),
                };
            });
    } catch {
        return [];
    }
}

export function canWriteCanon(repoRoot = process.cwd()): { ok: boolean; reason?: string } {
    if (process.env.VERCEL) {
        return {
            ok: false,
            reason: 'El despliegue no puede escribir el repositorio. Congelar solo en local.',
        };
    }
    if (!existsSync(join(repoRoot, '.git'))) {
        return { ok: false, reason: 'No hay repositorio git escribible.' };
    }
    return { ok: true };
}
