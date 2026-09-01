import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BottomNavWrapper from "@/components/BottomNavWrapper";
import MainWrapper from "@/components/MainWrapper";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { PushNotificationsPrompt } from "@/components/PushNotificationsPrompt";
import { ClientDisplayModeReporter } from "@/components/ClientDisplayModeReporter";
import { UnreadNotificationsShell } from "@/components/UnreadNotificationsShell";
import SileoProvider from "@/components/SileoProvider";
import ChatMarbellaLazy from "@/components/chat/ChatMarbellaLazy";
import { UsageAuthenticatedTracker } from "@/components/usage/UsageAuthenticatedTracker";
import { StudioPreviewClient } from "@/components/studio/StudioPreviewClient";
import { ChromeScrollProvider } from "@/components/chrome/ChromeScrollProvider";
import { catalogTitleFont } from "@/lib/fonts/catalog-title";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#15345C",
  interactiveWidget: "overlays-content",
};

export const metadata: Metadata = {
  title: "Bar La Marbella",
  // Importante: al compartir en WhatsApp/Telegram no queremos texto secundario.
  // Omitimos `description` para evitar que se renderice `og:description` y `meta[name=description]`.
  manifest: "/manifest.json",
  openGraph: {
    title: "Bar La Marbella",
    description: "",
  },
  twitter: {
    title: "Bar La Marbella",
    description: "",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "La Marbella",
  },
  icons: {
    icon: "/icons/logo-white.png",
    apple: "/icons/logo-white.png",
  },
};

/**
 * Layout raíz síncrono: no await de Supabase aquí.
 * Antes `getSession` (+ cookies) bloqueaba TODO el HTML → pantalla blanca.
 * Auth de shell (push, usage, display-mode) se resuelve en cliente.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="light">
      <body
        className={cn(
          inter.className,
          catalogTitleFont.variable,
          "bg-marbella-shell",
          "touch-manipulation",
        )}
      >
        <UnreadNotificationsShell>
          <SileoProvider />
          <ServiceWorkerRegistration />
          <ClientDisplayModeReporter />
          <PushNotificationsPrompt />
          
          <StudioPreviewClient>
            <ChromeScrollProvider>
            <Navbar />
            <MainWrapper>{children}</MainWrapper>
            <BottomNavWrapper />
            <UsageAuthenticatedTracker />

            {/* LÓGICA DEL ASISTENTE (INVISIBLE HASTA QUE PULSES TU BOTÓN IA) */}
            <ChatMarbellaLazy />
            </ChromeScrollProvider>
          </StudioPreviewClient>
        </UnreadNotificationsShell>
      </body>
    </html>
  );
}
