'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronLeft } from 'lucide-react';
import { NotificationsBell } from '@/components/NotificationsBell';
import { ReservationsBell } from '@/components/ReservationsBell';
import { GlobalSearch } from '@/components/GlobalSearch';
import { createClient } from "@/utils/supabase/client";
import { cn, firstGivenName } from '@/lib/utils';
import { getHomeHrefForUser } from '@/lib/master-dashboard';
import { isFullscreenCartaPath } from '@/lib/carta-fullscreen-path';
import { navigateInsideSandbox } from '@/lib/sandbox/client';
import { useChromeScroll } from '@/components/chrome/ChromeScrollProvider';
import { useMasterViewAs } from '@/components/master/MasterViewAsProvider';

const CAMERA_ACCESS_EMAILS = new Set(['fogotorrat@gmail.com', 'hhector7722@gmail.com']);

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { topHidden } = useChromeScroll();
  const { identity, isMaster, sessionReady, openViewAsPicker } = useMasterViewAs();
  const [userData, setUserData] = useState<{ id: string; name: string; role: string; searchRole: string; email: string; authEmail: string; is_supervisor?: boolean } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        const { data: profile, error: profileError } = await supabase.from('profiles').select('first_name, role, email, is_supervisor').eq('id', user.id).single();
        const role = (profile?.role ?? user.user_metadata?.role ?? 'staff') as string;
        const name = profile?.first_name ?? user.user_metadata?.first_name ?? 'Empleado';
        const email = (profile?.email ?? user.email ?? '').trim().toLowerCase();
        const is_supervisor = profile?.is_supervisor ?? user.user_metadata?.is_supervisor ?? false;
        setUserData({ id: user.id, name, role, searchRole: profile?.role ?? 'staff', email, authEmail: user.email?.trim().toLowerCase() ?? '', is_supervisor });
        if (profileError) console.error('Error fetching user profile in Navbar:', profileError);
      } catch (error) { console.error('Critical error in Navbar fetchUserData:', error); }
    };
    fetchUserData();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { fetchUserData(); });
    return () => subscription.unsubscribe();
  }, [supabase]);
  if (pathname === '/login' || isFullscreenCartaPath(pathname) || pathname.startsWith('/reporte') || pathname.startsWith('/alta') || pathname.startsWith('/playground') || pathname.startsWith('/design-system')) return null;
  const effectiveRole = identity?.isViewingAs ? identity.effectiveRole : userData?.role;
  const effectiveCameraEmail = (identity?.effectiveEmail ?? userData?.email)?.trim().toLowerCase();
  const canSeeCamera = Boolean(sessionReady && effectiveCameraEmail && CAMERA_ACCESS_EMAILS.has(effectiveCameraEmail));
  const displayName = isMaster && identity ? identity.effectiveName : (userData?.name ?? '');
  const isDashboard = pathname === '/dashboard' || pathname === '/staff/dashboard' || pathname === '/master/dashboard';
  const homePath = isMaster && identity?.isViewingAs ? getHomeHrefForUser(identity.effectiveEmail, identity.effectiveRole) : getHomeHrefForUser(userData?.email, userData?.role);
  const hideNavbarBack = isDashboard || (pathname === '/profile' && effectiveRole === 'manager');
  const compactName = displayName ? firstGivenName(displayName) : '';
  const searchIdentity = { userId: identity?.effectiveUserId ?? userData?.id ?? '', role: identity?.isViewingAs ? identity.effectiveRole : userData?.searchRole ?? null, email: identity?.isViewingAs ? identity.effectiveEmail : userData?.authEmail ?? null, isViewingAs: Boolean(identity?.isViewingAs) };
  return <nav data-component="AppNavbar" data-hidden={topHidden && !searchOpen ? 'true' : undefined} className={cn('marbella-fixed-topbar text-white pt-safe fixed top-0 right-0 left-0 z-[100] h-header-safe flex items-center isolate print:hidden')}>
    <div className="relative max-w-7xl lg:max-w-none mx-auto flex items-center justify-between gap-1 px-1 lg:px-4 w-full min-w-0">
      <div className="flex min-w-0 shrink-0 items-center gap-1">
        {!hideNavbarBack && <button onClick={() => { if (!navigateInsideSandbox(homePath)) router.push(homePath); }} className={cn('shrink-0 grid place-items-center', 'border-0 bg-transparent shadow-none rounded-none', 'active:opacity-70 transition-opacity')} data-element="chrome" aria-label="Ir a inicio"><ChevronLeft strokeWidth={2.5} aria-hidden /></button>}
        <div className="flex min-w-0 items-center gap-1"><div data-element="logo" className="relative shrink-0"><Image src="/icons/logo-white.png" alt="Logo" fill className="object-contain" priority /></div><div data-element="greeting-block">{isMaster ? <button type="button" data-element="greeting" onClick={openViewAsPicker} className="border-0 bg-transparent p-0 text-left text-inherit shadow-none outline-none hover:opacity-90 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:content-[''] relative" aria-label={identity?.isViewingAs ? `Viendo como ${identity.effectiveName}. Cambiar usuario` : 'Cambiar usuario de vista'}>{compactName}</button> : <span data-element="greeting">{compactName}</span>}</div></div>
      </div>
      {sessionReady && searchIdentity.userId ? <div data-element="global-search-host" className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"><div className="pointer-events-auto"><GlobalSearch key={searchIdentity.userId} identity={searchIdentity} onOpenChange={setSearchOpen} /></div></div> : null}
      <div className="flex shrink-0 items-center -space-x-3">
        {canSeeCamera ? <button type="button" data-element="live-camera" aria-label="Abrir cámaras" title="Cámara" onClick={() => router.push('/camaras')} className="flex shrink-0 items-center justify-center border-0 bg-transparent p-0 transition-opacity hover:opacity-90 active:opacity-70"><Image src="/icons/live-camera.png" alt="" width={48} height={48} className="block shrink-0 object-contain" /></button> : null}
        <ReservationsBell /><NotificationsBell />
      </div>
    </div>
  </nav>;
}
