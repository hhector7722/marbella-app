'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';
import { MASTER_DASHBOARD_EMAIL } from '@/lib/master-dashboard';
import VentasPage from '@/app/dashboard/ventas/page';
import HistoryPage from '@/app/dashboard/history/page';
import MovementsPage from '@/app/dashboard/movements/page';
import LaborPage from '@/app/dashboard/labor/page';
import SalaPage from '@/app/dashboard/sala/page';
import RecipesPage from '@/app/recipes/page';
import IngredientsPage from '@/app/ingredients/page';
import SuppliersPage from '@/app/suppliers/page';
import StaffHistoryPage from '@/app/staff/history/page';
import { RealInsightsView } from './RealInsightsView';
import { DesignProvider } from '../screens/system';
import { SANDBOX_ROUTES, useSandboxStore, useActiveEstetica } from '../store';
import type { Recipe, SandboxRoute, StudioFontFamily } from '../types';
import { enableSandboxRuntime, pushSandboxUrl } from '@/lib/sandbox/client';
import { VisualLabSurface } from './VisualLab';
import type { VisualOverrides } from '../types';

// Las páginas reales pueden ser client components o páginas server con searchParams.
// El Studio las monta como superficies, sin reinterpretar sus props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RealPage = React.ComponentType<any>;

const REAL_PAGES: Partial<Record<SandboxRoute, RealPage>> = {
    '/master/dashboard': () => <DashboardSwitcher userRole="manager" userEmail={MASTER_DASHBOARD_EMAIL} initialView="master" />,
    '/dashboard': () => <DashboardSwitcher userRole="manager" userEmail={MASTER_DASHBOARD_EMAIL} initialView="admin" />,
    '/staff/dashboard': () => <DashboardSwitcher userRole="staff" initialView="staff" />,
    '/dashboard/ventas': VentasPage,
    '/dashboard/history': HistoryPage,
    '/dashboard/movements': MovementsPage,
    '/dashboard/labor': LaborPage,
    '/dashboard/sala': SalaPage,
    '/recipes': RecipesPage,
    '/ingredients': IngredientsPage,
    '/suppliers': SuppliersPage,
    '/dashboard/insights': RealInsightsView,
    '/staff/history': StaffHistoryPage,
    '/registros': StaffHistoryPage,
};

export function RealAppView({ recipeOverride, overrides = {}, fontFamily }: { recipeOverride?: Recipe; overrides?: VisualOverrides; fontFamily?: StudioFontFamily }) {
    const route = useSandboxStore(s => s.route);
    const setRoute = useSandboxStore(s => s.setRoute);
    const searchParams = useSearchParams();
    const estetica = useActiveEstetica();
    const Page = REAL_PAGES[route];
    const recipe = recipeOverride ?? estetica.recipe;

    enableSandboxRuntime((href: string) => {
        const url = new URL(href, window.location.origin);
        const pathname = url.pathname as SandboxRoute;
        if (!SANDBOX_ROUTES.some(candidate => candidate.id === pathname)) return false;
        setRoute(pathname);
        const query = url.searchParams.toString();
        pushSandboxUrl(`/playground/studio?route=${encodeURIComponent(pathname)}${query ? `&${query}` : ''}`);
        return true;
    });

    if (!Page) return null;

    return (
        <DesignProvider recipe={recipe} fontFamily={fontFamily}>
            <VisualLabSurface route={route} overrides={overrides}>
                <div data-marbella-sandbox="true" className="min-h-full bg-white text-zinc-900">
                    <Page key={route} searchParams={Promise.resolve(Object.fromEntries(searchParams.entries()))} />
                </div>
            </VisualLabSurface>
        </DesignProvider>
    );
}

export function hasRealSandboxPage(route: SandboxRoute): boolean {
    return Boolean(REAL_PAGES[route]);
}
