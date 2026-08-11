export interface StudioFontOption {
    id: string;
    family: string;
    label: string;
    style: string;
    url: string;
    format: 'truetype' | 'opentype' | 'woff' | 'woff2';
}

export function describeFontFile(fileName: string, metadata?: { family?: string; style?: string }): StudioFontOption | null {
    const extension = fileName.toLowerCase().split('.').pop();
    if (!extension || !['ttf', 'otf', 'woff', 'woff2'].includes(extension)) return null;

    const base = fileName.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, '');
    let family = base;
    let style = 'Regular';

    if (/^RobotoFlex/i.test(base)) {
        family = 'Roboto Flex';
        style = /italic/i.test(base) ? 'Italic' : 'Variable';
    }

    const sourceFamily = metadata?.family?.trim() || family;
    const sourceStyle = metadata?.style?.split('\n')[0]?.trim() || style;
    const cssFamily = `${sourceFamily} · ${sourceStyle}`;

    const format = extension === 'ttf' ? 'truetype' : extension === 'otf' ? 'opentype' : extension;
    return {
        id: fileName,
        family: cssFamily,
        label: `${sourceFamily} · ${sourceStyle}`,
        style: sourceStyle,
        url: `/fonts/${encodeURIComponent(fileName)}`,
        format: format as StudioFontOption['format'],
    };
}
