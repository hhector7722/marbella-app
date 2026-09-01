import localFont from 'next/font/local';

/**
 * TOKENS `tipo.familia.catalogo` — títulos de Ingredientes, Recetas y Proveedores.
 * Fichero: public/fonts/EASPORTS15.ttf
 */
export const catalogTitleFont = localFont({
    src: '../../../public/fonts/EASPORTS15.ttf',
    variable: '--font-easports',
    display: 'swap',
    weight: '400',
});
