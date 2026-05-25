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
  themeColor: "#ffffff",
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

/**
 * Aplica un timeout a una promesa de SSR para que un hang en GoTrue
 * o PostgREST NUNCA congele el render de TODA la app. Sin esto, una
 * sola llamada lenta a `auth.getSession()` en este layout deja la página
 * en "cargando" infinito para usuarios cuya cookie de sesión necesita
 * refresco. Anti-silent-failures: si timeout, devolvemos `fallback`
 * y la app se renderiza igualmente (las páginas internas tendrán
 * que volver a verificar sesión por su cuenta).
 */
async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

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
      <body className={`${inter.className} bg-[#5B8FB9] touch-manipulation`}>
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