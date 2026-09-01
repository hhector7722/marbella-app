'use client';

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

export type TabBarMode = 'full' | 'compact' | 'hidden';

export type ChromeScrollValue = {
    topHidden: boolean;
    tabMode: TabBarMode;
    toolbarPinned: boolean;
};

const DEFAULT_CHROME: ChromeScrollValue = {
    topHidden: false,
    tabMode: 'full',
    toolbarPinned: false,
};

const ChromeScrollContext = createContext<ChromeScrollValue>(DEFAULT_CHROME);

export function useChromeScroll() {
    return useContext(ChromeScrollContext);
}

/**
 * Un solo oído de scroll para cabecera, tab bar y buscador de PageScreen.
 * Abajo: se ocultan. Arriba: cabecera, tab bar y buscador vuelven, también
 * si estás al fondo de la página.
 */
export function ChromeScrollProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [value, setValue] = useState<ChromeScrollValue>(DEFAULT_CHROME);

    useEffect(() => {
        setValue(DEFAULT_CHROME);
    }, [pathname]);

    useEffect(() => {
        let lastY = window.scrollY;
        let downAcc = 0;
        let upAcc = 0;
        let tabMode: TabBarMode = 'full';

        const onScroll = (event: Event) => {
            const target = event.target;
            let y = window.scrollY;
            if (
                target instanceof HTMLElement &&
                target !== document.documentElement &&
                target !== document.body
            ) {
                y = target.scrollTop;
            }

            if (y < 16) {
                downAcc = 0;
                upAcc = 0;
                tabMode = 'full';
                lastY = y;
                setValue(DEFAULT_CHROME);
                return;
            }

            if (y > lastY + 6) {
                downAcc += y - lastY;
                upAcc = 0;
                if (tabMode === 'full' && downAcc > 18) {
                    tabMode = 'compact';
                    downAcc = 0;
                } else if (tabMode === 'compact' && downAcc > 36) {
                    tabMode = 'hidden';
                }
                lastY = y;
                setValue({
                    topHidden: true,
                    tabMode,
                    toolbarPinned: false,
                });
                return;
            }

            if (y < lastY - 6) {
                upAcc += lastY - y;
                downAcc = 0;
                if (tabMode === 'hidden' && upAcc > 12) {
                    tabMode = 'compact';
                    upAcc = 0;
                } else if (tabMode === 'compact' && upAcc > 18) {
                    tabMode = 'full';
                }
                lastY = y;
                setValue({
                    topHidden: false,
                    tabMode,
                    toolbarPinned: true,
                });
                return;
            }

            lastY = y;
        };

        document.addEventListener('scroll', onScroll, { passive: true, capture: true });
        return () => document.removeEventListener('scroll', onScroll, true);
    }, [pathname]);

    useEffect(() => {
        const root = document.documentElement;
        root.dataset.topbarHidden = value.topHidden ? 'true' : 'false';
        root.dataset.tabMode = value.tabMode;
        return () => {
            delete root.dataset.topbarHidden;
            delete root.dataset.tabMode;
        };
    }, [value]);

    const memo = useMemo(() => value, [value]);

    return (
        <ChromeScrollContext.Provider value={memo}>{children}</ChromeScrollContext.Provider>
    );
}
