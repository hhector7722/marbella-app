import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fotos de albarán pueden superar el límite por defecto (1 MB) de Server Actions
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  // Incluir PDF de vales en el bundle del API route (no va en /public).
  outputFileTracingIncludes: {
    "/api/propuestas/vales-bebida": [
      "./docs/propuestas/vales-bebida-cena-monitores.pdf",
    ],
  },
  // 🧠 AISLAMIENTO ESTRICTO: Evita que Webpack/Turbopack minifique y rompa la librería
  serverExternalPackages: ["pdf-parse", "sharp"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co", // Comodín para cualquier proyecto Supabase
      },
    ],
  },
  async rewrites() {
    return [{ source: "/propuestas", destination: "/propuestas/index.html" }];
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;

    config.ignoreWarnings = [
      { module: /node_modules\/jspdf/ }
    ];

    return config;
  },
};

export default nextConfig;