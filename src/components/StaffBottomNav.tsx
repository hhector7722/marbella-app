'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Calendar, Clock, Home, Package, User, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trackUsageTabSwitch } from '@/lib/usage/client';
import { createClient } from '@/utils/supabase/client';
import { getHomeHrefForUser, isMasterDashboardUser } from '@/lib/master-dashboard';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import { StaffScheduleModal } from '@/components/modals/StaffScheduleModal';

type NavAction = 'scheduleModal' | 'supplierModal' | 'home';

type StaffNavItem = {
    name: string;
    href: string;
    icon: LucideIcon;
    action?: NavAction;
};

const STAFF_NAV_ITEMS: StaffNavItem[] = [
    { name: 'Horarios', href: '#horarios', icon: Calendar, action: 'scheduleModal' },
    { name: 'Asistencia', href: '/staff/history', icon: Clock },
    { name: 'Inicio', href: '/staff/dashboard', icon: Home, action: 'home' },
    { name: 'Pedidos', href: '/orders/new', icon: Package, action: 'supplierModal' },
    { name: 'Perfil', href: '/profile', icon: User },
];

export default function StaffBottomNav() {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const [homeHref, setHomeHref] = useState('/staff/dashboard');
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [monthShifts, setMonthShifts] = useState<
        { date: Date; startTime: string; endTime: string; activity?: string }[]
    >([]);
    const [userData, setUserData] = useState<{
        id: string;
        name: string;
        role: string;
        email: string;
    } | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadProfile() {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user || cancelled) return;

            const authEmail = user.email ?? '';
            const roleHint = (user.user_metadata?.role as string | undefined) ?? 'staff';
            let resolvedHome = getHomeHrefForUser(authEmail, roleHint);

            const { data } = await supabase
                .from('profiles')
                .select('first_name, role, email')
                .eq('id', user.id)
                .single();

            if (data) {
                const email = data.email || authEmail;
                const role = data.role || roleHint;
                resolvedHome = getHomeHrefForUser(email, role);
                if (!cancelled) {
                    setUserData({
                        id: user.id,
                        name: data.first_name || 'Empleado',
                        role,
                        email,
                    });
                }
            }

            if (!cancelled) {
                setHomeHref(resolvedHome);
            }

            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const { data: realShifts } = await supabase
                .from('shifts')
                .select('start_time, end_time, activity, activity_2')
                .eq('user_id', user.id)
                .eq('is_published', true)
                .gte('start_time', startOfMonth.toISOString())
                .order('start_time', { ascending: true });

            if (!cancelled && realShifts?.length) {
                setMonthShifts(
                    realShifts.map((s) => {
                        const start = new Date(s.start_time);
                        const end = new Date(s.end_time);
                        return {
                            date: start,
                            startTime: start.toLocaleTimeString('es-ES', {
                                hour: '2-digit',
                                minute: '2-digit',
                            }),
                            endTime: end.toLocaleTimeString('es-ES', {
                                hour: '2-digit',
                                minute: '2-digit',
                            }),
                            activity: s.activity || s.activity_2 || undefined,
                        };
                    })
                );
            } else if (!cancelled) {
                setMonthShifts([]);
            }
        }

        void loadProfile();
        return () => {
            cancelled = true;
        };
    }, [supabase]);

    const isMasterUser = isMasterDashboardUser(userData?.email);

    const isHomeActive = (href: string) => {
        if (href !== homeHref) return false;
        if (isMasterUser) {
            return (
                pathname === '/master/dashboard' ||
                pathname === '/dashboard' ||
                pathname === '/staff/dashboard'
            );
        }
        return pathname === href || pathname.startsWith(`${href}/`);
    };

    const isActive = (item: StaffNavItem) => {
        if (item.action === 'home') return isHomeActive(homeHref);
        if (item.href.startsWith('#')) return false;
        return pathname === item.href || pathname.startsWith(`${item.href}/`);
    };

    return (
        <>
            <nav
                className="marbella-fixed-bottombar fixed bottom-0 left-0 right-0 z-[95] flex h-20 items-center justify-around border-t border-white/10 bg-[#5B8FB9] px-2 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.1)] backdrop-blur-md md:h-16 md:px-8 print:hidden"
                aria-label="Navegación staff"
            >
                {STAFF_NAV_ITEMS.map((item) => {
                    const active = isActive(item);
                    const Icon = item.icon;
                    const linkHref = item.action === 'home' ? homeHref : item.href;

                    return (
                        <Link
                            key={item.name}
                            href={linkHref}
                            className={cn(
                                'flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center transition-all duration-200 active:scale-95',
                                active
                                    ? 'scale-110 text-white drop-shadow-md'
                                    : 'text-blue-200 hover:text-white'
                            )}
                            aria-current={active ? 'page' : undefined}
                            onClick={(e) => {
                                if (item.action === 'scheduleModal') {
                                    e.preventDefault();
                                    trackUsageTabSwitch(pathname, '#horarios', item.name);
                                    setIsScheduleModalOpen(true);
                                } else if (item.action === 'supplierModal') {
                                    e.preventDefault();
                                    trackUsageTabSwitch(pathname, '/orders/new', item.name);
                                    setIsSupplierModalOpen(true);
                                } else if (item.action === 'home') {
                                    e.preventDefault();
                                    trackUsageTabSwitch(pathname, homeHref, item.name);
                                    router.push(homeHref);
                                } else if (!item.href.startsWith('#')) {
                                    trackUsageTabSwitch(pathname, linkHref, item.name);
                                }
                            }}
                        >
                            <Icon size={20} className="md:h-5 md:w-5" strokeWidth={2.5} />
                            <span className="mt-0.5 text-[7.5px] font-black uppercase tracking-tighter whitespace-nowrap md:mt-1 md:text-[9px] md:tracking-widest">
                                {item.name}
                            </span>
                        </Link>
                    );
                })}
            </nav>

            <SupplierSelectionModal
                isOpen={isSupplierModalOpen}
                onClose={() => setIsSupplierModalOpen(false)}
            />

            <StaffScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={() => setIsScheduleModalOpen(false)}
                shifts={monthShifts}
                userName={userData?.name}
                userRole={(userData?.role as 'staff' | 'manager' | 'supervisor') ?? 'staff'}
                userId={userData?.id}
            />
        </>
    );
}
