import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

function lanDevHosts(): string[] {
  const hosts = new Set<string>();
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      const family = addr.family;
      const isV4 = family === "IPv4";
      if (!isV4 || addr.internal) continue;
      hosts.add(addr.address);
    }
  }
  return [...hosts];
}

function extraDevHosts(): string[] {
  return (
    process.env.ALLOWED_DEV_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => origin.replace(/^https?:\/\//, "").replace(/:\d+$/, "")) ?? []
  );
}

const lanHosts = lanDevHosts();
const devHosts = [
  "localhost",
  "127.0.0.1",
  "192.168.1.247",
  ...lanHosts,
  ...extraDevHosts(),
];

const nextConfig: NextConfig = {
  // Teléfono en la LAN: sin esto, el login carga y luego Next bloquea el paso a la app.
  allowedDevOrigins: devHosts,
  // Fotos de albarán pueden superar el límite por defecto (1 MB) de Server Actions
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
    serverActions: {
      bodySizeLimit: "12mb",
      allowedOrigins: [
        "localhost:3000",
        "127.0.0.1:3000",
        "192.168.1.247:3000",
        ...lanHosts.map((host) => `${host}:3000`),
      ],
    },
  },
  // Incluir PDF de vales en el bundle del API route (no va en /public).
  outputFileTracingIncludes: {
    "/api/propuestas/vales-bebida": [
      "./assets/propuestas/vales-bebida-cena-monitores.pdf",
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