'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, LogOut, User, Calendar, Clock, Settings, Package } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import Image from 'next/image';
import { toast } from 'sonner';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import { StaffProductModal } from '@/components/modals/StaffProductModal';
import { StaffScheduleModal } from '@/components/modals/StaffScheduleModal';
import { Calendar as CalendarIcon } from 'lucide-react';

export default function BottomNavStaff() {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const [userData, setUserData] = useState<{ name: string; role: string; avatar_url: string | null } | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [monthShifts, setMonthShifts] = useState<any[]>([]);

    if (pathname === '/login') return null;

    useEffect(() => {
        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase
                    .from('profiles')
                    .select('first_name, role, avatar_url')
                    .eq('id', user.id)
                    .single();
                if (data) {
                    setUserData({
                        name: data.first_name || 'Empleado',
                        role: data.role || 'staff',
                        avatar_url: data.avatar_url || null
                    });
                }

                // Load shifts for the current month
                const today = new Date();
                const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                const { data: realShifts } = await supabase
                    .from('shifts')
                    .select('start_time, end_time, activity')
                    .eq('user_id', user.id)
                    .eq('is_published', true)
                    .gte('start_time', startOfMonth.toISOString())
                    .order('start_time', { ascending: true });

                if (realShifts && realShifts.length > 0) {
                    const formattedShifts = realShifts.map(s => {
                        const start = new Date(s.start_time);
                        const end = new Date(s.end_time);
                        return {
                            date: start,
                            startTime: start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                            endTime: end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                            activity: s.activity || undefined
                        };
                    });
                    setMonthShifts(formattedShifts);
                }
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
    const getClass = (path: string) => {
        const active = isActive(path);
        return active
            ? "text-white scale-105 md:scale-110 drop-shadow-md"
            : "text-blue-100/70 hover:text-white transition-all";
    };

    const isAdmin = userData?.role === 'manager' || userData?.role === 'supervisor';
    const userRole = (userData?.role as any) || 'staff';

    const staffItems: { name: string; href: string; icon: any }[] = [
        { name: 'Horarios', href: '#horarios', icon: CalendarIcon },
        { name: 'Asistencia', href: userData?.role === 'manager' ? '/registros' : '/staff/history', icon: Clock },
        { name: 'Inicio', href: isAdmin ? '/dashboard' : '/staff/dashboard', icon: Home },
        { name: 'Pedidos', href: '/orders/new', icon: Package },
        {
            name: 'Cuenta', href: '/profile', icon: () => (
                <div className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center overflow-hidden">
                    {userData?.avatar_url ? (
                        <Image
                            src={userData.avatar_url}
                            alt="Me"
                            width={32}
                            height={32}
                            className="w-full h-full object-cover rounded-full border border-white/20"
                        />
                    ) : (
                        <User size={20} className="text-current md:w-6 md:h-6" />
                    )}
                </div>
            )
        },
    ];

    return (
        <>
            {/* UNIVERSAL: Bottom Bar */}
            <nav className="fixed bottom-0 left-0 right-0 h-14 md:h-16 pb-safe bg-[#5B8FB9] border-t border-white/10 z-30 flex justify-around items-center px-4 md:px-12 shadow-[0_-4px_30px_rgba(0,0,0,0.15)] backdrop-blur-md">
                <div className="max-w-5xl w-full flex justify-around items-center">
                    {staffItems.map((item) => (
                        <Link key={item.href} href={item.href} className={`flex flex-col items-center transition-all duration-200 active:scale-95 flex-1 ${getClass(item.href)}`} onClick={(e) => {
                            if (item.name.toLowerCase() === 'pedidos') {
                                e.preventDefault();
                                setIsProductModalOpen(true);
                            } else if (item.name.toLowerCase() === 'horarios') {
                                e.preventDefault();
                                setIsScheduleModalOpen(true);
                            }
                        }}>
                            <div className="md:mb-0.5">
                                {typeof item.icon === 'function' ? <item.icon /> : <item.icon size={isActive(item.href) ? 20 : 18} className="md:w-6 md:h-6" />}
                            </div>
                            <span className="text-[7px] md:text-[9px] font-black mt-0.5 uppercase tracking-widest whitespace-nowrap">{item.name}</span>
                        </Link>
                    ))}
                </div>
            </nav>

            <StaffProductModal
                isOpen={isProductModalOpen}
                onClose={() => setIsProductModalOpen(false)}
                onOpenSupplierModal={() => setIsSupplierModalOpen(true)}
            />

            <SupplierSelectionModal
                isOpen={isSupplierModalOpen}
                onClose={() => setIsSupplierModalOpen(false)}
            />

            <StaffScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={() => setIsScheduleModalOpen(false)}
                shifts={monthShifts}
                userName={userData?.name}
                userRole={userRole}
            />
        </>
    );
}
