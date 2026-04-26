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
  themeColor: "#3E6A8A",
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
      <body className={`${inter.className} bg-[#3E6A8A] touch-manipulation`}>
        <SileoProvider />
        <ServiceWorkerRegistration />
        <Navbar />
        <MainWrapper>
          <OnboardingOverlay needsOnboarding={needsOnboarding} />
          {children}
        </MainWrapper>
        <BottomNavWrapper />
        
        {/* LÓGICA DEL ASISTENTE (INVISIBLE HASTA QUE PULSES TU BOTÓN IA) */}
        <ChatMarbella />
      </body>
    </html>
  );
}