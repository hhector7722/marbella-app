import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bar La Marbella - Gestión",
  description: "Sistema de gestión interna",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <div className="flex min-h-screen bg-[#5B8FB9]">

          {/* 1. Componente Sidebar (Solo visible en PC) */}
          <Sidebar />

          {/* 2. Contenido de la Página (El children) */}
          <main className="flex-1 flex flex-col h-screen overflow-hidden">
            {/* Toaster global para que funcione en todas las pantallas */}
            <Toaster position="top-right" />

            {/* El contenido real de la página, con scroll independiente */}
            <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
              {children}
            </div>
          </main>

          {/* 3. Componente BottomNav (Solo visible en Móvil) */}
          <BottomNav />

        </div>
      </body>
    </html>
  );
}