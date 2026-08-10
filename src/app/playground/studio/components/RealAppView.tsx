'use client';

import React from 'react';
import VentasPage from '@/app/dashboard/ventas/page';
import HistoryPage from '@/app/dashboard/history/page';
import MovementsPage from '@/app/dashboard/movements/page';
import LaborPage from '@/app/dashboard/labor/page';
import SalaPage from '@/app/dashboard/sala/page';
import StaffHistoryPage from '@/app/staff/history/page';
import { RealInsightsView } from './RealInsightsView';
import { DesignProvider } from '../screens/system';
import { resolverReceta } from '../design-context';
import { SANDBOX_ROUTES, useSandboxStore, useActiveEstetica } from '../store';
import type { SandboxRoute } from '../types';
import { enableSandboxRuntime } from '@/lib/sandbox/client';

type RealPage = React.ComponentType<{ sandboxNavigate?: (href: string) => void }>;

const REAL_PAGES: Partial<Record<SandboxRoute, RealPage>> = {
    '/dashboard/ventas': VentasPage,
    '/dashboard/history': HistoryPage,
    '/dashboard/movements': MovementsPage,
    '/dashboard/labor': LaborPage,
    '/dashboard/sala': SalaPage,
    '/dashboard/insights': RealInsightsView,
    '/staff/history': StaffHistoryPage,
    '/registros': StaffHistoryPage,
};

export function RealAppView() {
    const route = useSandboxStore(s => s.route);
    const setRoute = useSandboxStore(s => s.setRoute);
    const estetica = useActiveEstetica();
    const Page = REAL_PAGES[route];
    const visual = resolverReceta(estetica.recipe);

    enableSandboxRuntime((href: string) => {
        const pathname = href.split('?')[0] as SandboxRoute;
        if (!SANDBOX_ROUTES.some(candidate => candidate.id === pathname)) return false;
        setRoute(pathname);
        return true;
    }, visual);

    if (!Page) return null;

    return (
        <DesignProvider recipe={estetica.recipe}>
            <div data-marbella-sandbox="true" className="min-h-full bg-white text-zinc-900">
                <Page key={route} />
            </div>
        </DesignProvider>
    );
}

export function hasRealSandboxPage(route: SandboxRoute): boolean {
    return Boolean(REAL_PAGES[route]);
}
