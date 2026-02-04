'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { MessageSquare } from 'lucide-react';
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

    if (pathname === '/login' || !userData) return null;

    const isAdminMode = pathname.startsWith('/dashboard') || pathname.startsWith('/recipes') || pathname.startsWith('/ingredients');

    return (
        <nav className="bg-[#5B8FB9] text-white p-4 sticky top-0 z-[100] border-b border-white/10 backdrop-blur-md shadow-sm">
            <div className="max-w-7xl mx-auto flex items-center justify-between px-2">

                {/* BLOQUE IZQUIERDO: LOGO + SALUDO (CON ESPACIADO) */}
                <div className="flex items-center gap-4">
                    <div className="relative w-16 h-16">
                        <Image src="/logo-white.png" alt="Logo" fill className="object-contain" priority />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-white text-base font-black leading-none uppercase tracking-[0.25em]">
                            Hola, {userData.name}
                        </span>
                    </div>
                </div>

                {/* BLOQUE DERECHO: INTERRUPTOR + BOTÓN IA */}
                <div className="flex items-center gap-5">
                    {/* INTERRUPTOR */}
                    {userData.role === 'manager' && (
                        <button
                            onClick={() => router.push(isAdminMode ? '/staff/dashboard' : '/dashboard')}
                            className={`relative w-20 h-8 flex items-center rounded-full transition-all duration-300 shadow-inner border-2 border-white/30 p-1 ${isAdminMode ? 'bg-[#FF9800]' : 'bg-[#4CAF50]'
                                }`}
                        >
                            <span className={`absolute w-full text-center text-[9px] font-black text-white uppercase transition-all duration-300 tracking-widest ${isAdminMode ? 'pl-4' : 'pr-8'
                                }`}>
                                {isAdminMode ? 'ADMIN' : 'STAFF'}
                            </span>
                            <div className={`bg-gradient-to-b from-white to-gray-200 h-6 w-6 rounded-full shadow-lg transform transition-transform duration-300 border border-gray-300 ${isAdminMode ? 'translate-x-0' : 'translate-x-11'
                                }`} />
                        </button>
                    )}

                    {/* BOTÓN IA RECTANGULAR */}
                    <button
                        className="flex items-center gap-2 px-4 h-10 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-md border border-white/20 active:scale-95 group"
                    >
                        <span className="text-[10px] font-black tracking-[0.2em] text-white">IA</span>
                        <MessageSquare size={18} className="text-white group-hover:scale-110 transition-transform" strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </nav>
    );
}