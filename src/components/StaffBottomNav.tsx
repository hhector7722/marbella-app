'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Calendar, Clock, Home, Package, User, type LucideIcon } from 'lucide-react';
import { trackUsageTabSwitch } from '@/lib/usage/client';
import { createClient } from '@/utils/supabase/client';
import { getHomeHrefForUser, isMasterDashboardUser } from '@/lib/master-dashboard';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import { StaffScheduleModal } from '@/components/modals/StaffScheduleModal';
import { useVisualViewportBottomPin } from '@/hooks/useVisualViewportBottomPin';
import { useChromeScroll } from '@/components/chrome/ChromeScrollProvider';

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
  const effectivePathname = pathname;
  const router = useRouter();
  const supabase = createClient();
  const navRef = useRef<HTMLElement>(null);
  const { tabMode } = useChromeScroll();
  const hidden = tabMode === 'hidden';

  useVisualViewportBottomPin(navRef);

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



  // Load profile and shifts
  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
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
        effectivePathname === '/master/dashboard' ||
        effectivePathname === '/dashboard' ||
        effectivePathname === '/staff/dashboard'
      );
    }
    return effectivePathname === href || effectivePathname.startsWith(`${href}/`);
  };

  const isActive = (item: StaffNavItem) => {
    if (item.action === 'home') return isHomeActive(homeHref);
    if (item.href.startsWith('#')) return false;
    return effectivePathname === item.href || effectivePathname.startsWith(`${item.href}/`);
  };

  const scheduleHref = '/horario';

  return (
    <>
      <nav
        ref={navRef}
        data-component="TabBar"
        data-mode={tabMode}
        data-hidden={hidden ? 'true' : undefined}
        aria-hidden={hidden || undefined}
        className="marbella-fixed-bottombar print:hidden"
        aria-label="Navegación"
      >
        {STAFF_NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          const linkHref =
            item.action === 'home' ? homeHref
            : item.action === 'scheduleModal' ? scheduleHref
            : item.href;
          return (
            <Link
              key={item.name}
              href={linkHref}
              data-element="item"
              data-active={active ? 'true' : undefined}
              aria-current={active ? 'page' : undefined}
              onClick={(e) => {
                if (item.action === 'scheduleModal') {
                  e.preventDefault();
                  trackUsageTabSwitch(effectivePathname, scheduleHref, item.name);
                  router.push(scheduleHref);
                } else if (item.action === 'supplierModal') {
                  e.preventDefault();
                  trackUsageTabSwitch(effectivePathname, '/orders/new', item.name);
                  setIsSupplierModalOpen(true);
                } else if (item.action === 'home') {
                  e.preventDefault();
                  trackUsageTabSwitch(effectivePathname, homeHref, item.name);
                  router.push(homeHref);
                } else if (!item.href.startsWith('#')) {
                  trackUsageTabSwitch(effectivePathname, linkHref, item.name);
                }
              }}
            >
              <span data-element="icon" aria-hidden>
                <Icon strokeWidth={active ? 2 : 1.75} fill="none" />
              </span>
              <span data-element="label">{item.name}</span>
            </Link>
          );
        })}
        <StaffScheduleModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          shifts={monthShifts}
        />
      </nav>
      <SupplierSelectionModal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
      />
    </>
  );
}
