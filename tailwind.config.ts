import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: "class",
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                easports: ['var(--font-easports)', 'sans-serif'],
            },
            colors: {
                "ds-superficie": "var(--color-superficie)",
                "ds-borde": "var(--color-borde)",
                "ds-borde-marcado": "var(--color-borde-marcado)",
                "ds-texto": "var(--color-texto)",
                "ds-texto-fuerte": "var(--color-texto-fuerte)",
                "ds-texto-tenue": "var(--color-texto-tenue)",
                "ds-marca": "var(--color-marca)",
                "ds-marca-intenso": "var(--color-marca-intenso)",
                "ds-superficie-inactiva": "var(--color-superficie-inactiva)",
                "ds-texto-invertido": "var(--color-texto-invertido)",
                "ds-positivo": "var(--color-positivo)",
                "ds-negativo": "var(--color-negativo)",
                "ds-negativo-fondo": "var(--color-negativo-fondo)",
                "ds-positivo-fondo": "var(--color-positivo-fondo)",
                "ds-aviso": "var(--color-aviso)",
                "ds-aviso-fondo": "var(--color-aviso-fondo)",
                "ds-informativo": "var(--color-informativo)",
                "ds-informativo-fondo": "var(--color-informativo-fondo)",
                "ds-critico": "var(--color-critico)",
            },
            borderRadius: {
                "ds-control": "var(--radio-control)",
                "ds-superficie": "var(--radio-superficie)",
            },
            spacing: {
                "ds-1": "var(--espacio-1)",
                "ds-2": "var(--espacio-2)",
                "ds-3": "var(--espacio-3)",
                "ds-4": "var(--espacio-4)",
                "ds-8": "var(--espacio-8)",
            },
            minHeight: {
                "ds-tactil": "var(--tactil-minimo)",
                "ds-modal-header": "var(--modal-header-height)",
            },
            minWidth: {
                "ds-tactil": "var(--tactil-minimo)",
            },
            height: {
                "ds-modal-header": "var(--modal-header-height)",
            },
            maxHeight: {
                "ds-modal": "var(--modal-max-height)",
                "ds-modal-header": "var(--modal-header-height)",
            },
            boxShadow: {
                "ds-superficie": "var(--elevacion-superficie)",
                "ds-modal": "var(--elevacion-modal)",
                "ds-pagina": "var(--elevacion-pagina)",
            },
        },
    },
    plugins: [],
};
export default config;
