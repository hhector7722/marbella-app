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
            colors: {
                "ds-superficie": "var(--color-superficie)",
                "ds-borde": "var(--color-borde)",
                "ds-texto-fuerte": "var(--color-texto-fuerte)",
                "ds-marca": "var(--color-marca)",
                "ds-marca-intenso": "var(--color-marca-intenso)",
                "ds-superficie-inactiva": "var(--color-superficie-inactiva)",
                "ds-texto-invertido": "var(--color-texto-invertido)",
                "ds-positivo": "var(--color-positivo)",
                "ds-negativo": "var(--color-negativo)",
                "ds-negativo-fondo": "var(--color-negativo-fondo)",
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
            },
        },
    },
    plugins: [],
};
export default config;
