import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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