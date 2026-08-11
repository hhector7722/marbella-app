import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NextResponse } from 'next/server';
import { describeFontFile } from '../font-catalog';

export async function GET() {
    const directory = path.join(process.cwd(), 'public', 'fonts');
    const files = await readdir(directory, { withFileTypes: true });
    const fonts = files
        .filter(file => file.isFile())
        .map(file => {
            let metadata: { family?: string; style?: string } | undefined;
            try {
                const output = execFileSync('fc-scan', ['--format=%{family}\t%{style}\n', path.join(directory, file.name)], { encoding: 'utf8' });
                const [family, style] = output.split('\n')[0].split('\t');
                metadata = { family, style };
            } catch {
                metadata = undefined;
            }
            return describeFontFile(file.name, metadata);
        })
        .filter((font): font is NonNullable<typeof font> => Boolean(font));

    return NextResponse.json(fonts);
}
