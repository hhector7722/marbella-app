export interface StudioFontOption {
    id: string;
    family: string;
    label: string;
    style: string;
    url: string;
    format: 'truetype' | 'opentype' | 'woff' | 'woff2';
}

export function describeFontFile(fileName: string): StudioFontOption | null {
    const extension = fileName.toLowerCase().split('.').pop();
    if (!extension || !['ttf', 'otf', 'woff', 'woff2'].includes(extension)) return null;

    const base = fileName.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, '');
    let family = base;
    let style = 'Regular';

    if (/^EA Sports Covers SC/i.test(base)) {
        family = /outline/i.test(base) ? 'EA Sports Covers SC Outline' : 'EA Sports Covers SC';
        style = /outline/i.test(base) ? 'Outline' : /bold/i.test(base) ? 'Bold' : 'Regular';
    } else if (/^RobotoFlex/i.test(base)) {
        family = 'RobotoFlex';
        style = /italic/i.test(base) ? 'Italic' : 'Variable';
    }

    const format = extension === 'ttf' ? 'truetype' : extension === 'otf' ? 'opentype' : extension;
    return {
        id: fileName,
        family,
        label: `${family} · ${style}`,
        style,
        url: `/fonts/${encodeURIComponent(fileName)}`,
        format: format as StudioFontOption['format'],
    };
}
