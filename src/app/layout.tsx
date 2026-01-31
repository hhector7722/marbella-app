import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // Asegúrate de que importas tus estilos globales aquí

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bar La Marbella",
  description: "Sistema de Gestión",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}