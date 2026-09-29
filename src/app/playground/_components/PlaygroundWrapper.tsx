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
                <div
                    className="min-h-dvh px-2 pb-4 pt-[64px] sm:px-3 sm:pb-3 sm:pt-[68px] xl:h-dvh xl:overflow-hidden"
                    style={{
                        backgroundColor: 'var(--color-envolvente)',
                        backgroundImage: 'var(--marbella-shell-image)',
                    }}
                >
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
