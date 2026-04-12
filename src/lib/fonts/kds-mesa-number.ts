import { Graduate } from 'next/font/google';

/**
 * Tipografía display para número de mesa en KDS: bloque con serifas tipo dorsal
 * deportivo (inspiración genérica “vintage league”, sin logotipos de marca).
 */
export const kdsMesaNumberFont = Graduate({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    variable: '--font-kds-mesa-number',
});
