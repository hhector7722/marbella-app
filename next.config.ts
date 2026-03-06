import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      { module: /node_modules\/jspdf/ },
      { module: /node_modules\/pdfjs-dist/ }
    ];

    return config;
  },
};

export default nextConfig;