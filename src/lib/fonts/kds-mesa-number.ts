import { Teko } from 'next/font/google';

/**
 * Dorsal / marcador condensado y angular (Google Fonts), más cercano a números
 * deportivos tipo “league” que Graduate; sin assets de marca.
 */
export const kdsMesaNumberFont = Teko({
    subsets: ['latin'],
    weight: '700',
    display: 'swap',
    variable: '--font-kds-mesa-number',
});
