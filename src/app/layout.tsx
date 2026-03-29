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
      <body className={`${inter.className} bg-[#5B8FB9] touch-manipulation`}>
        <SileoProvider />
        <ServiceWorkerRegistration />

        {/* LA NAVBAR AHORA LLEVA EL CHAT INCORPORADO */}
        <header className="fixed top-0 left-0 right-0 z-50 pt-safe bg-[#5B8FB9]">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-[10px] font-bold text-[#5B8FB9]">bar marbella</div>
              <span className="text-white font-bold text-sm tracking-tight uppercase">HOLA, {user?.email?.split('@')[0].toUpperCase() || 'HECTOR'}</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-orange-500 text-[10px] font-black text-white px-2 py-1 rounded-full shadow-sm flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div> ADM
              </div>
              <ChatMarbella /> {/* AQUÍ ESTÁ EL BOTÓN DE IA */}
            </div>
          </div>
        </header>

        <MainWrapper>
          <OnboardingOverlay needsOnboarding={needsOnboarding} />
          <div className="mt-14">
            {children}
          </div>
        </MainWrapper>

        <BottomNavWrapper />
      </body>
    </html>
  );
}