'use client';

import { useState, useEffect } from 'react';
import {
    Clock, Home, Settings, LogOut, Calendar, User, Mic, MessageSquare,
    X, Sparkles, ShieldAlert
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import { Toaster } from 'sonner';
import Image from 'next/image';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const [showAIMenu, setShowAIMenu] = useState(false);
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const [userRole, setUserRole] = useState<'staff' | 'manager'>('staff');

    useEffect(() => {
        const fetchProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();
                if (profile) setUserRole(profile.role === 'manager' ? 'manager' : 'staff');
            }
        };
        fetchProfile();
    }, []);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const navItems = [
        { name: 'Horarios', href: '/staff/schedule', icon: Calendar },
        { name: 'Asistencia', href: '/staff/history', icon: Clock },
        { name: 'Inicio', href: '/staff/dashboard', icon: Home },
        { name: 'Perfil', href: '/staff/profile', icon: User },
        { name: 'Cuenta', href: '/staff/account', icon: Settings },
    ];

    const isActive = (path: string) => pathname === path;
    const corporateBlue = "bg-[#5B8FB9]";
    const sidebarDark = "bg-[#1a1a1a]";

    return (
        <div className={`flex min-h-screen ${corporateBlue}`}>
            <Toaster position="top-center" richColors />

            {/* SIDEBAR ESCRITORIO */}
            <aside className={`hidden md:flex w-64 flex-col ${sidebarDark} text-white fixed h-full shadow-2xl z-50`}>
                <div className="p-4 border-b border-gray-800 flex items-center justify-center h-36">
                    <div className="relative w-full h-full">
                        <Image src="/logo-white.png" alt="Logo" fill className="object-contain" priority />
                    </div>
                </div>
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    {navItems.map((item) => (
                        <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive(item.href) ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                            <item.icon size={20} className={isActive(item.href) ? 'text-white' : 'text-gray-400 group-hover:text-white'} />
                            <span className="font-medium text-sm">{item.name}</span>
                        </Link>
                    ))}
                </nav>
                <div className="p-4 border-t border-gray-800">
                    <button onClick={handleSignOut} className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-red-400 hover:bg-red-500/10 transition-colors font-medium text-sm">
                        <LogOut size={20} />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </aside>

            {/* HEADER MÓVIL (SOLO LOGO Y BOTONES) */}
            <header className={`md:hidden fixed top-0 left-0 right-0 px-4 py-2 flex justify-between items-center z-50 ${corporateBlue} shadow-sm`}>
                <div className="relative w-28 h-8">
                    <Image src="/logo-white.png" alt="Logo" fill className="object-contain object-left" priority />
                </div>

                <div className="flex items-center gap-2">
                    {userRole === 'manager' && (
                        <Link href="/dashboard" className="bg-orange-500 hover:bg-orange-600 text-white px-2 py-1.5 rounded-lg flex items-center gap-1 shadow-sm border border-orange-400 active:scale-95">
                            <ShieldAlert size={14} className="text-orange-100" />
                            <span className="text-[10px] font-black uppercase tracking-wide">Gestión</span>
                        </Link>
                    )}
                    <button onClick={() => setShowAIMenu(true)} className="bg-gradient-to-br from-blue-400 to-purple-500 p-1.5 rounded-full text-white shadow-sm border border-white/20 active:scale-95">
                        <Sparkles size={18} strokeWidth={2.5} />
                    </button>
                </div>
            </header>

            {/* CONTENIDO PRINCIPAL */}
            <main className={`flex-1 w-full md:ml-64 md:p-8 pt-[60px] pb-24 px-3 min-h-screen ${corporateBlue}`}>
                {children}
            </main>

            {/* BARRA INFERIOR */}
            <nav className={`md:hidden fixed bottom-0 left-0 right-0 ${corporateBlue} text-white z-50 pb-safe border-t border-white/10 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] rounded-t-3xl`}>
                <div className="flex justify-between items-center h-16 px-6">
                    {navItems.map((item) => {
                        if (item.name === 'Cuenta') {
                            return (
                                <div key={item.name} className="relative">
                                    {showAccountMenu && (
                                        <div className="absolute bottom-14 right-0 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 text-gray-800 mb-2">
                                            <Link href="/staff/account" onClick={() => setShowAccountMenu(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50">
                                                <div className="bg-blue-100 p-1.5 rounded-lg text-blue-600"><Settings size={16} /></div>
                                                <span className="text-sm font-bold text-gray-700">Mi Cuenta</span>
                                            </Link>
                                            <button onClick={handleSignOut} className="flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 text-red-600 w-full text-left mt-1">
                                                <div className="bg-red-100 p-1.5 rounded-lg text-red-600"><LogOut size={16} /></div>
                                                <span className="text-sm font-bold">Cerrar Sesión</span>
                                            </button>
                                        </div>
                                    )}
                                    <button onClick={() => setShowAccountMenu(!showAccountMenu)} className={`flex flex-col items-center justify-center space-y-1 ${showAccountMenu || isActive(item.href) ? 'text-white' : 'text-blue-200'}`}>
                                        <item.icon size={20} strokeWidth={2.5} />
                                    </button>
                                </div>
                            );
                        }
                        return (
                            <Link key={item.href} href={item.href} className={`flex flex-col items-center justify-center space-y-1 ${isActive(item.href) ? 'text-white' : 'text-blue-200'}`}>
                                <item.icon size={20} strokeWidth={2.5} />
                            </Link>
                        );
                    })}
                </div>
            </nav>

            {/* POPUP IA */}
            {showAIMenu && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl relative">
                        <button onClick={() => setShowAIMenu(false)} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200"><X size={16} /></button>
                        <div className="text-center mb-6">
                            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mx-auto flex items-center justify-center text-white mb-3 shadow-lg">
                                <Sparkles size={30} strokeWidth={2.5} />
                            </div>
                            <h3 className="text-xl font-black text-gray-800">Asistente IA</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <button className="flex flex-col items-center gap-2 p-4 bg-blue-50 rounded-2xl border-2 border-blue-100"><Mic size={24} className="text-blue-600" /><span className="font-bold text-gray-700">Voz</span></button>
                            <button className="flex flex-col items-center gap-2 p-4 bg-purple-50 rounded-2xl border-2 border-purple-100"><MessageSquare size={24} className="text-purple-600" /><span className="font-bold text-gray-700">Chat</span></button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}