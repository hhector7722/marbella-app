import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { createClient } from "@/utils/supabase/server";
import OnboardingOverlay from "@/components/OnboardingOverlay";
import Navbar from "@/components/Navbar";
import BottomNavWrapper from "@/components/BottomNavWrapper";
import MainWrapper from "@/components/MainWrapper";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import SileoProvider from "@/components/SileoProvider";
import ChatMarbella from "@/components/chat/ChatMarbella";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#5B8FB9",
};

export const metadata: Metadata = {
  title: "Bar La Marbella",
  description: "Sistema de Gestión",
  manifest: "/manifest.json",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let needsOnboarding = false;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('needs_onboarding')
      .eq('id', user.id)
      .single();

    needsOnboarding = profile?.needs_onboarding || false;
  }

  return (
    <html lang="es" className="light">
      <body className={`${inter.className} bg-[#5B8FB9] touch-manipulation pb-safe`}>
        <SileoProvider />
        <ServiceWorkerRegistration />
        <Navbar />
        
        <MainWrapper>
          <OnboardingOverlay needsOnboarding={needsOnboarding} />
          
          {/* Contenido principal de la página */}
          {children}

          {/* CONTENEDOR NATIVO PARA EL CHAT 
              Ubicado al final del scroll del MainWrapper para que no flote 
          */}
          <div className="px-4 mt-8 mb-24">
            <div 
              id="n8n-chat-marbella-container" 
              className="w-full overflow-hidden"
            >
              {/* n8n inyectará el chat aquí */}
            </div>
          </div>
        </MainWrapper>

        {/* Menú inferior de navegación */}
        <BottomNavWrapper />

        {/* Lógica de inicialización del chat */}
        <ChatMarbella />
      </body>
    </html>
  );
}