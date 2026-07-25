import type { Config } from "tailwindcss";

/**
 * Semantic colors → CSS variables (MDS Sprint 2).
 * Do not put raw hex here — values live in globals.css / Design System tokens.
 */
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
                background: "var(--background)",
                foreground: "var(--foreground)",
                surface: "var(--surface)",
                border: "var(--border)",
                input: "var(--input)",
                ring: "var(--ring)",
                primary: {
                    DEFAULT: "var(--primary)",
                    foreground: "var(--primary-foreground)",
                },
                secondary: {
                    DEFAULT: "var(--secondary)",
                    foreground: "var(--secondary-foreground)",
                },
                muted: {
                    DEFAULT: "var(--muted)",
                    foreground: "var(--muted-foreground)",
                },
                accent: {
                    DEFAULT: "var(--accent)",
                    foreground: "var(--accent-foreground)",
                },
                destructive: {
                    DEFAULT: "var(--destructive)",
                },
                card: {
                    DEFAULT: "var(--card)",
                    foreground: "var(--card-foreground)",
                },
                popover: {
                    DEFAULT: "var(--popover)",
                    foreground: "var(--popover-foreground)",
                },
                sidebar: {
                    DEFAULT: "var(--sidebar)",
                    foreground: "var(--sidebar-foreground)",
                    primary: "var(--sidebar-primary)",
                    "primary-foreground": "var(--sidebar-primary-foreground)",
                    accent: "var(--sidebar-accent)",
                    "accent-foreground": "var(--sidebar-accent-foreground)",
                    border: "var(--sidebar-border)",
                    ring: "var(--sidebar-ring)",
                },
                success: "var(--success)",
                warning: "var(--warning)",
                danger: "var(--danger)",
                /** MDS raw tokens (always MDS palette, independent of legacy freeze) */
                mds: {
                    background: "var(--mds-background)",
                    surface: "var(--mds-surface)",
                    foreground: "var(--mds-foreground)",
                    border: "var(--mds-border)",
                    primary: "var(--mds-primary)",
                    "primary-foreground": "var(--mds-primary-foreground)",
                    secondary: "var(--mds-secondary)",
                    "secondary-foreground": "var(--mds-secondary-foreground)",
                    muted: "var(--mds-muted)",
                    "muted-surface": "var(--mds-muted-surface)",
                    success: "var(--mds-success)",
                    warning: "var(--mds-warning)",
                    danger: "var(--mds-danger)",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
        },
    },
    plugins: [],
};
export default config;
