'use client';

import { usePathname } from 'next/navigation';
import PlaygroundShell from './PlaygroundShell';

export default function PlaygroundWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isStudio = pathname === '/playground/studio';
    const isKitchenSheets = pathname === '/playground/fichas-cocina';

    if (isStudio) {
        return <>{children}</>;
    }

    return (
        <>
            <PlaygroundShell />
            {isKitchenSheets ? (
                <div className="h-dvh overflow-hidden px-3 pb-3 pt-[68px]">
                    {children}
                </div>
            ) : (
                <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-20 md:px-8">
                    {children}
                </div>
            )}
        </>
    );
}
