'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import {
    isAppShellScrollPage,
    isFullscreenCartaPath,
    isInternalScrollShellPath,
} from '@/lib/carta-fullscreen-path';
import { isV2ShellPath } from '@/lib/v2-shell-path';

export default function MainWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLogin = pathname === '/login';
    const fullscreenCarta = isFullscreenCartaPath(pathname);
    const v2Shell = isV2ShellPath(pathname);
    const internalScrollShell = isInternalScrollShellPath(pathname) || v2Shell;
    const appShellScroll = isAppShellScrollPage(pathname) || v2Shell;
    const hideLegacyChromePad = isLogin || fullscreenCarta || v2Shell;

    return (
        <main className={cn(
            'min-h-screen transition-all duration-300',
            !hideLegacyChromePad && 'pt-header-safe',
            !hideLegacyChromePad && !appShellScroll && 'pb-[calc(5rem+env(safe-area-inset-bottom))]'
        )}>
            <PullToRefresh enabled={!isLogin && !internalScrollShell}>
                {children}
            </PullToRefresh>
        </main>
    );
}
