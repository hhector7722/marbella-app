import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fotos de albarán pueden superar el límite por defecto (1 MB) de Server Actions
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  // 🧠 AISLAMIENTO ESTRICTO: Evita que Webpack/Turbopack minifique y rompa la librería
  serverExternalPackages: ["pdf-parse"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co", // Comodín para cualquier proyecto Supabase
      },
    ],
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