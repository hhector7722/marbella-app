'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronLeft } from 'lucide-react';
import { NotificationsBell } from '@/components/NotificationsBell';
import { ReservationsBell } from '@/components/ReservationsBell';
import { createClient } from "@/utils/supabase/client";
import { useAIStore } from '@/store/aiStore';
import { cn } from '@/lib/utils';
import { getHomeHrefForUser, isMasterDashboardUser } from '@/lib/master-dashboard';
import { isFullscreenCartaPath } from '@/lib/carta-fullscreen-path';
import { isV2ShellPath } from '@/lib/v2-shell-path';

export default function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();
    const [userData, setUserData] = useState<{ name: string; role: string; email: string; is_supervisor?: boolean } | null>(null);

    // ANÁLISIS CRÍTICO: Tienes esta función de Zustand activada en el botón.
    const toggleChat = useAIStore((state) => state.toggleChat);


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
    if (isV2ShellPath(pathname)) return null;

    const isDashboard = pathname === '/dashboard' || pathname === '/staff/dashboard' || pathname === '/master/dashboard';
    const homePath = getHomeHrefForUser(userData?.email, userData?.role);
    // En /profile el manager usa la flecha del propio perfil (abre plantilla); no duplicar la del Navbar
    const hideNavbarBack = isDashboard || (pathname === '/profile' && userData?.role === 'manager');

    return (
        <>
            <nav
                className={cn(
                    'marbella-fixed-topbar bg-transparent text-white pt-safe fixed top-0 right-0 left-0 z-[100] border-b border-white/15 backdrop-blur-md shadow-sm h-header-safe flex items-center transition-all duration-300 isolate print:hidden'
                )}
            >
                <div className="max-w-7xl mx-auto flex items-center justify-between px-1 w-full">

                    <div className="flex items-center gap-1">
                        {!hideNavbarBack && (
                            <button
                                onClick={() => {
                                    router.push(homePath);
                                }}
                                className={cn(
                                    'h-12 w-12 shrink-0 grid place-items-center',
                                    'border-0 bg-transparent shadow-none rounded-none',
                                    'active:opacity-70 transition-opacity'
                                )}
                                aria-label="Ir a inicio"
                            >
                                <ChevronLeft size={22} strokeWidth={2.5} />
                            </button>
                        )}
                        <div className="flex items-center gap-2">
                            <div className="relative w-8 h-8 md:w-9 md:h-9 shrink-0">
                                <Image src="/icons/logo-white.png" alt="Logo" fill className="object-contain" priority />
                            </div>
                            <span className="text-white text-[8px] md:text-[10px] font-black leading-none uppercase tracking-wider whitespace-nowrap">
                                {userData ? `Hola, ${userData.name}` : ''}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-2">
                        <div className="flex items-center -space-x-2">
                            <ReservationsBell />
                            <NotificationsBell />
                        </div>

                        {/* BOTÓN IA RECTANGULAR - solo texto */}
                        <button
                            id="ia-button"
                            onClick={toggleChat}
                            className="flex items-center px-2.5 h-8 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-md border border-white/20 active:scale-95"
                        >
                            <span className="text-[9px] font-black tracking-[0.15em] text-white">IA</span>
                        </button>
                    </div>
                </div>
            </nav>
        </>
    );
}