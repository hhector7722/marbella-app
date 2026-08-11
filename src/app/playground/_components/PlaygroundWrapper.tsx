'use client';

import { usePathname } from 'next/navigation';
import PlaygroundShell from './PlaygroundShell';

export default function PlaygroundWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isStudio = pathname === '/playground/studio';

    if (isStudio) {
        return <>{children}</>;
    }

    return (
        <>
            <PlaygroundShell />
            <div className="pt-20 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto">
                {children}
            </div>
        </>
    );
}
