import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { describeFontFile } from '../font-catalog';

export async function GET() {
    const directory = path.join(process.cwd(), 'public', 'fonts');
    const files = await readdir(directory, { withFileTypes: true });
    const fonts = files
        .filter(file => file.isFile())
        .map(file => describeFontFile(file.name))
        .filter((font): font is NonNullable<typeof font> => Boolean(font));

    return NextResponse.json(fonts);
}
