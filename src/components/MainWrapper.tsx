'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import {
    isAppShellScrollPage,
    isDashboardMosaicPath,
    isFullscreenCartaPath,
    isInternalScrollShellPath,
} from '@/lib/carta-fullscreen-path';

export default function MainWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLogin = pathname === '/login' || pathname.startsWith('/alta');
    const isPublicForm = pathname.startsWith('/reporte');
    const hideAppChrome = isLogin || isPublicForm;
    const fullscreenCarta = isFullscreenCartaPath(pathname);
    const internalScrollShell = isInternalScrollShellPath(pathname);
    const appShellScroll = isAppShellScrollPage(pathname);
    const isDesignSystem = pathname.startsWith('/design-system');
    const dashboardMosaic = isDashboardMosaicPath(pathname);

    return (
        <main
            data-app-shell={
                !hideAppChrome && !fullscreenCarta && !isDesignSystem ? 'true' : undefined
            }
            className={cn(
            'min-h-screen',
            !hideAppChrome && !fullscreenCarta && !isDesignSystem && (
                dashboardMosaic ? 'pt-header-safe-tight' : 'pt-header-safe'
            ),
            !hideAppChrome && !fullscreenCarta && !appShellScroll && 'pb-[calc(var(--shell-bottom-inset)+var(--espacio-2))]'
        )}>
            <PullToRefresh enabled={!isLogin && !internalScrollShell}>
                {children}
            </PullToRefresh>
        </main>
    );
}
