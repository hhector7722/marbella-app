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
    const getClass = (path: string, isDesktop = false) => {
        const active = isActive(path);
        if (isDesktop) {
            return active
                ? "bg-white/20 text-white"
                : "text-blue-200 hover:bg-white/10 hover:text-white";
        }
        return active
            ? "text-white scale-110 drop-shadow-md"
            : "text-blue-200 hover:text-white";
    };

    const staffItems = [
        { name: 'Inicio', href: '/staff/dashboard', icon: Home },
        { name: 'Horarios', href: '/staff/schedule', icon: Calendar },
        { name: 'Asistencia', href: '/staff/history', icon: Clock },
    ];

    return (
        <>
            {isMenuOpen && (
                <div className="fixed inset-0 z-[90]" onClick={() => setIsMenuOpen(false)} />
            )}

            {/* MOBILE: Bottom Bar - same height as admin (h-16) */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#5B8FB9] border-t border-white/10 z-[100] flex justify-around items-center px-4 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] backdrop-blur-md">
                {staffItems.map((item) => (
                    <Link key={item.href} href={item.href} className={`flex flex-col items-center transition-all duration-200 active:scale-95 ${getClass(item.href)}`}>
                        <item.icon size={20} />
                        <span className="text-[8px] font-bold mt-0.5 uppercase tracking-tighter">{item.name}</span>
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
                        className={`flex flex-col items-center transition-all duration-200 active:scale-95 ${isMenuOpen ? "text-white scale-110" : "text-blue-200"}`}
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

            {/* DESKTOP: Sidebar - same width as admin (w-20) */}
            <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-20 bg-[#5B8FB9] flex-col items-center py-6 z-[100] shadow-xl border-r border-white/10">
                {/* Nav Items */}
                <div className="flex-1 flex flex-col gap-2 w-full px-2">
                    {staffItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center py-3 rounded-xl transition-all duration-200 active:scale-95 ${getClass(item.href, true)}`}
                        >
                            <item.icon size={20} />
                            <span className="text-[8px] font-bold mt-1 uppercase tracking-tighter">{item.name}</span>
                        </Link>
                    ))}
                </div>

                {/* Profile Button */}
                <div className="mt-auto flex flex-col gap-2 w-full px-2">
                    <Link
                        href="/profile"
                        className={`flex flex-col items-center py-3 rounded-xl transition-all duration-200 ${getClass('/profile', true)}`}
                    >
                        <div className="w-8 h-8 rounded-full bg-white/20 border border-white/40 flex items-center justify-center overflow-hidden">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Me" className="w-full h-full object-cover" />
                            ) : (
                                <User size={16} className="text-white" />
                            )}
                        </div>
                        <span className="text-[8px] font-bold mt-1 uppercase tracking-tighter text-blue-200">Perfil</span>
                    </Link>

                    <button
                        onClick={handleLogout}
                        className="flex flex-col items-center py-3 rounded-xl transition-all duration-200 text-blue-200 hover:bg-red-500/20 hover:text-red-300"
                    >
                        <LogOut size={20} />
                        <span className="text-[8px] font-bold mt-1 uppercase tracking-tighter">Salir</span>
                    </button>
                </div>
            </aside>
        </>
    );
}
