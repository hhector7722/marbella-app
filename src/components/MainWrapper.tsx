'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import {
    isAppShellScrollPage,
    isFullscreenCartaPath,
    isInternalScrollShellPath,
} from '@/lib/carta-fullscreen-path';

export default function MainWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLogin = pathname === '/login';
    const fullscreenCarta = isFullscreenCartaPath(pathname);
    const internalScrollShell = isInternalScrollShellPath(pathname);
    const appShellScroll = isAppShellScrollPage(pathname);
    const isDesignSystem = pathname.startsWith('/design-system');

    return (
        <main
            data-app-shell={
                !isLogin && !fullscreenCarta && !isDesignSystem ? 'true' : undefined
            }
            className={cn(
            'min-h-screen transition-all duration-300',
            !isLogin && !fullscreenCarta && !isDesignSystem && 'pt-header-safe',
            !isLogin && !fullscreenCarta && !appShellScroll && 'pb-[calc(var(--shell-bottom-inset)+var(--espacio-2))]'
        )}>
            <PullToRefresh enabled={!isLogin && !internalScrollShell}>
                {children}
            </PullToRefresh>
        </main>
    );
}
