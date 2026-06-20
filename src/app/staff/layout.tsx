'use client';

import { usePathname } from 'next/navigation';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';
import StaffBottomNav from '@/components/StaffBottomNav';
import { TabSwipeNavigator } from '@/components/navigation/TabSwipeNavigator';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    /** Carta staff: pantalla completa como `/carta` (sin barra inferior ni padding extra). */
    const isStaffCartaFullscreen = pathname === '/staff/carta';

    return (
        <>
            <Toaster position="top-center" richColors />
            <div
                className={cn(
                    'marbella-staff-shell min-h-screen',
                    isStaffCartaFullscreen
                        ? 'bg-white'
                        : 'pb-24 md:pb-20'
                )}
            >
                {isStaffCartaFullscreen ? (
                    children
                ) : (
                    <TabSwipeNavigator>{children}</TabSwipeNavigator>
                )}
            </div>
            {!isStaffCartaFullscreen ? <StaffBottomNav /> : null}
        </>
    );
}
