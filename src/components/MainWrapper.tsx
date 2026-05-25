'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { PageContentLoading } from '@/components/ui/PageContentLoading';
import { useNavigationFeedbackOptional } from '@/lib/navigation/navigation-context';
import { shouldShowAppChrome } from '@/lib/app-chrome';

export default function MainWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { isLoading } = useNavigationFeedbackOptional();
    const isLogin = pathname === '/login';
    const showChrome = shouldShowAppChrome(pathname, isLoading);

    return (
        <main className={cn(
            'min-h-screen transition-all duration-300',
            !isLogin && showChrome && 'pt-header-safe',
            !isLogin && showChrome && 'pb-[calc(5rem+env(safe-area-inset-bottom))]'
        )}>
            <PullToRefresh enabled={!isLogin}>
                {children}
            </PullToRefresh>
            {isLoading && !isLogin ? <PageContentLoading /> : null}
        </main>
    );
}
