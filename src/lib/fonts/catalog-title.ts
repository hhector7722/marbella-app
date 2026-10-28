import localFont from 'next/font/local';

/**
 * TOKENS `tipo.familia.catalogo` — títulos de Ingredientes, Recetas y Proveedores.
 * Fuente reparada: public/fonts/EASPORTS15-ES.ttf.
 * El original tiene contornos vacíos para letras acentuadas, ñ y ü; el
 * archivo -ES compone esas marcas sobre los trazos originales EA Sports.
 */
export const catalogTitleFont = localFont({
    src: '../../../public/fonts/EASPORTS15-ES.ttf',
    variable: '--font-easports',
    display: 'swap',
    weight: '400',
});
