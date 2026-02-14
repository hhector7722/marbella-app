'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { MessageSquare, ChevronLeft } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";

export default function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();
    const [userData, setUserData] = useState<{ name: string; role: string } | null>(null);

    useEffect(() => {
        const fetchUserData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('first_name, role')
                    .eq('id', user.id)
                    .single();
                setUserData({
                    name: profile?.first_name || 'Empleado',
                    role: profile?.role || 'staff'
                });
            }
        };
        fetchUserData();
    }, [supabase]);

    if (pathname === '/login') return null;

    const isAdminMode = pathname.startsWith('/dashboard') || pathname.startsWith('/recipes') || pathname.startsWith('/ingredients');
    const isDashboard = pathname === '/dashboard' || pathname === '/staff/dashboard';

    return (
        <nav className={`bg-[#5B8FB9] text-white pt-safe fixed top-0 right-0 z-40 border-b border-white/10 backdrop-blur-md shadow-sm h-header-safe flex items-center transition-all duration-300 ${pathname === '/login' ? 'left-0' : 'left-0 md:left-20'}`}>
            <div className="max-w-7xl mx-auto flex items-center justify-between px-1 w-full">

                {/* BLOQUE IZQUIERDO: BOTÓN VOLVER + LOGO + SALUDO */}
                <div className="flex items-center gap-1">
                    {!isDashboard && (
                        <button
                            onClick={() => router.back()}
                            className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                            aria-label="Volver"
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

                {/* BLOQUE DERECHO: INTERRUPTOR + BOTÓN IA */}
                <div className="flex items-center gap-3">
                    {/* INTERRUPTOR (SOLO MANAGER) */}
                    {userData?.role === 'manager' && (
                        <button
                            onClick={() => router.push(isAdminMode ? '/staff/dashboard' : '/dashboard')}
                            className={`relative w-16 h-7 flex items-center rounded-full transition-all duration-300 shadow-inner border-2 border-white/30 p-1 ${isAdminMode ? 'bg-[#FF9800]' : 'bg-[#4CAF50]'
                                }`}
                        >
                            <span className={`absolute w-full text-center text-[7px] font-black text-white uppercase transition-all duration-300 tracking-widest ${isAdminMode ? 'pl-3' : 'pr-6'
                                }`}>
                                {isAdminMode ? 'ADM' : 'STAFF'}
                            </span>
                            <div className={`bg-gradient-to-b from-white to-gray-200 h-5 w-5 rounded-full shadow-lg transform transition-transform duration-300 border border-gray-300 ${isAdminMode ? 'translate-x-0' : 'translate-x-9'
                                }`} />
                        </button>
                    )}

                    {/* BOTÓN IA RECTANGULAR */}
                    <button
                        className="flex items-center gap-2 px-3 h-8 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-md border border-white/20 active:scale-95 group"
                    >
                        <span className="text-[9px] font-black tracking-[0.15em] text-white">IA</span>
                        <MessageSquare size={16} fill="currentColor" className="text-white group-hover:scale-110 transition-transform" strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </nav>
    );
}