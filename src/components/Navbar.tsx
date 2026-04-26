'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { MessageSquare, ChevronLeft } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import { useAIStore } from '@/store/aiStore';
import { cn } from '@/lib/utils';

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
                const { data: { user } } = await supabase.auth.getUser();
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

    const isAdminMode = pathname.startsWith('/dashboard') || pathname.startsWith('/recipes') || pathname.startsWith('/ingredients');
    const isDashboard = pathname === '/dashboard' || pathname === '/staff/dashboard';
    const homePath = isAdminMode || userData?.role === 'manager' ? '/dashboard' : '/staff/dashboard';

    return (
        <>
            <nav
                className={cn(
                    'bg-[#5F7F99] text-white pt-safe fixed top-0 right-0 left-0 z-[100] border-b border-white/10 backdrop-blur-md shadow-sm h-header-safe flex items-center transition-all duration-300 isolate print:hidden'
                )}
            >
                <div className="max-w-7xl mx-auto flex items-center justify-between px-1 w-full">

                    <div className="flex items-center gap-1">
                        {!isDashboard && (
                            <button
                                onClick={() => {
                                    router.push(homePath);
                                }}
                                className={cn(
                                    'h-12 w-12 shrink-0 grid place-items-center rounded-full transition-colors',
                                    'hover:bg-white/10 active:bg-white/15'
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

                    <div className="flex items-center gap-2 md:gap-3">
                        {userData?.role === 'manager' && (
                            <button
                                onClick={() => router.push(isAdminMode ? '/staff/dashboard' : '/dashboard')}
                                className={`relative w-16 h-7 flex items-center rounded-full transition-all duration-300 shadow-inner border-2 border-white/30 p-1 ${isAdminMode ? 'bg-[#FF9800]' : 'bg-[#4CAF50]'
                                    }`}
                                aria-label={isAdminMode ? 'Cambiar a vista Staff' : 'Cambiar a vista Admin'}
                            >
                                <span className={`absolute w-full text-center text-[7px] font-black text-white uppercase transition-all duration-300 tracking-widest ${isAdminMode ? 'pl-3' : 'pr-6'
                                    }`}>
                                    {isAdminMode ? 'ADM' : 'STAFF'}
                                </span>
                                <div className={`bg-gradient-to-b from-white to-gray-200 h-5 w-5 rounded-full shadow-lg transform transition-transform duration-300 border border-gray-300 ${isAdminMode ? 'translate-x-0' : 'translate-x-9'
                                    }`} />
                            </button>
                        )}

                        {/* BOTÓN IA RECTANGULAR CON EL ID AÑADIDO */}
                        <button
                            id="ia-button"
                            onClick={toggleChat}
                            className="flex items-center gap-2 px-3 h-8 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-md border border-white/20 active:scale-95 group"
                        >
                            <span className="text-[9px] font-black tracking-[0.15em] text-white">IA</span>
                            <MessageSquare size={16} fill="currentColor" className="text-white group-hover:scale-110 transition-transform" strokeWidth={2.5} />
                        </button>
                    </div>
                </div>
            </nav>
        </>
    );
}