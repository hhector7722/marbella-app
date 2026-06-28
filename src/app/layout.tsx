import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { createClient } from "@/utils/supabase/server";
import OnboardingOverlay from "@/components/OnboardingOverlay";
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
import { withTimeout } from "@/lib/with-timeout";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();

  // `auth.getSession()` con timeout corto (4s). Lee cookies locales; no
  // bloquea en round-trip a GoTrue como `getUser()`.
  const userPromise = (async () => {
    try {
      const r = await supabase.auth.getSession();
      return r.data.session?.user ?? null;
    } catch {
      return null;
    }
  })();
  const user = await withTimeout(userPromise, 4000, null);

  let needsOnboarding = false;

  if (user) {
    // `profiles.needs_onboarding` también acotado a 4s para no bloquear
    // el render si PostgREST está lento. Usamos `maybeSingle()` para no
    // fallar si el perfil aún no existe (señal de onboarding).
    const profilePromise = (async () => {
      try {
        const r = await supabase
          .from('profiles')
          .select('needs_onboarding')
          .eq('id', user.id)
          .maybeSingle();
        return (r.data as { needs_onboarding?: boolean } | null)?.needs_onboarding ?? false;
      } catch {
        return false;
      }
    })();
    needsOnboarding = await withTimeout<boolean>(profilePromise, 4000, false);
  }

  return (
    <html lang="es" className="light">
      <body className={`${inter.className} bg-marbella-shell touch-manipulation`}>
        <UnreadNotificationsShell>
          <SileoProvider />
          <ServiceWorkerRegistration />
          <ClientDisplayModeReporter isLoggedIn={!!user} />
          <PushNotificationsPrompt
            isLoggedIn={!!user}
            needsOnboarding={needsOnboarding}
            userEmail={user?.email ?? null}
          />
          <Navbar />
          <MainWrapper>
            <OnboardingOverlay needsOnboarding={needsOnboarding} />
            {children}
          </MainWrapper>
          <BottomNavWrapper />
          <UsageAuthenticatedTracker enabled={!!user} />

          {/* LÓGICA DEL ASISTENTE (INVISIBLE HASTA QUE PULSES TU BOTÓN IA) */}
          <ChatMarbellaLazy />
        </UnreadNotificationsShell>
      </body>
    </html>
  );
}