'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronLeft } from 'lucide-react';
import { NotificationsBell } from '@/components/NotificationsBell';
import { ReservationsBell } from '@/components/ReservationsBell';
import { createClient } from "@/utils/supabase/client";
import { cn } from '@/lib/utils';
import { getHomeHrefForUser } from '@/lib/master-dashboard';
import { isFullscreenCartaPath } from '@/lib/carta-fullscreen-path';
import { navigateInsideSandbox } from '@/lib/sandbox/client';
import { useChromeScroll } from '@/components/chrome/ChromeScrollProvider';
import { useMasterViewAs } from '@/components/master/MasterViewAsProvider';

export default function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();
    const { topHidden } = useChromeScroll();
    const { identity, isMaster, openViewAsPicker } = useMasterViewAs();
    const [userData, setUserData] = useState<{ name: string; role: string; email: string; is_supervisor?: boolean } | null>(null);

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const user = session?.user;
                if (!user) return;

                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('first_name, role, email, is_supervisor')
                    .eq('id', user.id)
                    .single();

                const role = (profile?.role ?? user.user_metadata?.role ?? 'staff') as string;
                const name = profile?.first_name ?? user.user_metadata?.first_name ?? 'Empleado';
                const email = profile?.email ?? user.email ?? '';
                const is_supervisor = profile?.is_supervisor ?? user.user_metadata?.is_supervisor ?? false;

                setUserData({ name, role, email, is_supervisor });
                if (profileError) {
                    console.error("Error fetching user profile in Navbar:", profileError);
                }
            } catch (error) {
                console.error("Critical error in Navbar fetchUserData:", error);
            }
        };

        fetchUserData();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            fetchUserData();
        });
        return () => subscription.unsubscribe();
    }, [supabase]);

    if (pathname === '/login') return null;
    if (isFullscreenCartaPath(pathname)) return null;
    if (pathname.startsWith('/reporte')) return null;
    if (pathname.startsWith('/playground')) return null;
    if (pathname.startsWith('/design-system')) return null;

    const effectiveRole = identity?.isViewingAs ? identity.effectiveRole : userData?.role;
    // Master: el saludo refleja siempre la identidad efectiva (tuya o la simulada).
    const displayName =
        isMaster && identity ? identity.effectiveName : (userData?.name ?? '');

    const isDashboard = pathname === '/dashboard' || pathname === '/staff/dashboard' || pathname === '/master/dashboard';
    const homePath =
        isMaster && identity?.isViewingAs
            ? getHomeHrefForUser(identity.effectiveEmail, identity.effectiveRole)
            : getHomeHrefForUser(userData?.email, userData?.role);
    const hideNavbarBack = isDashboard || (pathname === '/profile' && effectiveRole === 'manager');

    const greeting = displayName ? `Hola, ${displayName}` : '';

    return (
        <>
            <nav
                data-component="AppNavbar"
                data-hidden={topHidden ? 'true' : undefined}
                className={cn(
                    'marbella-fixed-topbar text-white pt-safe fixed top-0 right-0 left-0 z-[100] h-header-safe flex items-center isolate print:hidden'
                )}
            >
                <div className="max-w-7xl lg:max-w-none mx-auto flex items-center justify-between px-1 lg:px-4 w-full min-w-0">

                    <div className="flex min-w-0 flex-1 items-center gap-1">
                        {!hideNavbarBack && (
                            <button
                                onClick={() => {
                                    if (!navigateInsideSandbox(homePath)) router.push(homePath);
                                }}
                                className={cn(
                                    'shrink-0 grid place-items-center',
                                    'border-0 bg-transparent shadow-none rounded-none',
                                    'active:opacity-70 transition-opacity'
                                )}
                                data-element="chrome"
                                aria-label="Ir a inicio"
                            >
                                <ChevronLeft strokeWidth={2.5} aria-hidden />
                            </button>
                        )}
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                            <div data-element="logo" className="relative shrink-0">
                                <Image src="/icons/logo-white.png" alt="Logo" fill className="object-contain" priority />
                            </div>
                            <div data-element="greeting-block">
                                {isMaster ? (
                                    <button
                                        type="button"
                                        data-element="greeting"
                                        onClick={openViewAsPicker}
                                        className="border-0 bg-transparent p-0 text-left text-inherit shadow-none outline-none hover:opacity-90 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:content-[''] relative"
                                        aria-label={
                                            identity?.isViewingAs
                                                ? `Viendo como ${identity.effectiveName}. Cambiar usuario`
                                                : 'Cambiar usuario de vista'
                                        }
                                    >
                                        {greeting}
                                    </button>
                                ) : (
                                    <span data-element="greeting">{greeting}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center -space-x-2">
                        <ReservationsBell />
                        <NotificationsBell />
                    </div>
                </div>
            </nav>
        </>
    );
}
