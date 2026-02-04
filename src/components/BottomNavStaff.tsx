'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, LogOut, User, Calendar, Clock } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import { toast } from 'sonner';

export default function BottomNavStaff() {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    if (pathname === '/login') return null;

    useEffect(() => {
        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase
                    .from('profiles')
                    .select('avatar_url')
                    .eq('id', user.id)
                    .single();
                if (data?.avatar_url) setAvatarUrl(data.avatar_url);
            }
        }
        loadProfile();
    }, [supabase]);

    const handleLogout = async () => {
        if (!confirm("¿Seguro que quieres cerrar sesión?")) return;
        const { error } = await supabase.auth.signOut();
        if (error) {
            toast.error('Error al salir');
        } else {
            router.push('/login');
            router.refresh();
        }
    };

    const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');
    const getClass = (path: string) => isActive(path)
        ? "text-white scale-110 drop-shadow-md"
        : "text-blue-200 hover:text-white";

    const staffItems = [
        { name: 'Inicio', href: '/staff/dashboard', icon: Home },
        { name: 'Horarios', href: '/staff/schedule', icon: Calendar },
        { name: 'Asistencia', href: '/staff/history', icon: Clock },
        { name: 'Perfil', href: '/profile', icon: User },
    ];

    return (
        <>
            {isMenuOpen && (
                <div className="fixed inset-0 z-[90]" onClick={() => setIsMenuOpen(false)} />
            )}

            <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-[#5B8FB9]/95 backdrop-blur-lg border border-white/20 z-[100] flex justify-between px-6 py-2 pb-safe shadow-2xl rounded-full">
                {staffItems.map((item) => (
                    <Link key={item.href} href={item.href} className={`flex flex-col items-center transition-all duration-200 ${getClass(item.href)}`}>
                        <item.icon size={22} />
                        <span className="text-[9px] font-bold mt-1 uppercase tracking-tighter">{item.name}</span>
                    </Link>
                ))}

                <div className="relative">
                    {isMenuOpen && (
                        <div className="absolute bottom-[140%] right-0 min-w-[160px] bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.2)] border border-gray-100 p-2 flex flex-col gap-1 animate-in slide-in-from-bottom-2 fade-in duration-200 origin-bottom-right">
                            <Link
                                href="/profile"
                                onClick={() => setIsMenuOpen(false)}
                                className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-blue-50 rounded-xl transition-colors"
                            >
                                <User size={16} className="text-blue-600" />
                                Mi Cuenta
                            </Link>
                            <div className="h-px bg-gray-100 my-1 mx-2"></div>
                            <button
                                onClick={() => { setIsMenuOpen(false); handleLogout(); }}
                                className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors w-full text-left"
                            >
                                <LogOut size={16} />
                                Salir
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className={`flex flex-col items-center transition-all duration-200 ${isMenuOpen ? "text-white scale-110" : "text-blue-200"}`}
                    >
                        <div className="w-6 h-6 rounded-full bg-white/20 border border-white/40 flex items-center justify-center overflow-hidden mb-1">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Me" className="w-full h-full object-cover" />
                            ) : (
                                <User size={14} className="text-white" />
                            )}
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-tighter">Cuenta</span>
                    </button>
                </div>
            </nav>
        </>
    );
}
