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
            },
            borderRadius: {
                "ds-control": "var(--radio-control)",
                "ds-superficie": "var(--radio-superficie)",
            },
            spacing: {
                "ds-1": "var(--espacio-1)",
                "ds-2": "var(--espacio-2)",
            },
            minHeight: {
                "ds-tactil": "var(--tactil-minimo)",
            },
            boxShadow: {
                "ds-superficie": "var(--elevacion-superficie)",
            },
        },
    },
    plugins: [],
};
export default config;
