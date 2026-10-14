'use client';

import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

type DesktopSidebarContextValue = {
    isOpen: boolean;
    toggle: () => void;
    close: () => void;
};

const DesktopSidebarContext = createContext<DesktopSidebarContextValue | null>(null);

/**
 * El menú lateral nunca se abre al navegar. No se guarda en localStorage:
 * tanto una carga nueva como cada cambio de página empiezan con el contenido
 * a ancho completo, y el usuario puede desplegarlo en esa página.
 */
export function DesktopSidebarProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);
    const [route, setRoute] = useState(pathname);

    // En cambios de ruta internos, cerrar durante el render evita un frame
    // en el que la nueva página todavía reservase espacio para el panel.
    if (route !== pathname) {
        setRoute(pathname);
        setIsOpen(false);
    }

    useLayoutEffect(() => {
        document.documentElement.dataset.desktopSidebar = isOpen ? 'open' : 'closed';
        return () => {
            delete document.documentElement.dataset.desktopSidebar;
        };
    }, [isOpen]);

    const toggle = useCallback(() => setIsOpen(value => !value), []);
    const close = useCallback(() => setIsOpen(false), []);

    return (
        <DesktopSidebarContext.Provider value={{ isOpen, toggle, close }}>
            {children}
        </DesktopSidebarContext.Provider>
    );
}

export function useDesktopSidebar(): DesktopSidebarContextValue {
    const context = useContext(DesktopSidebarContext);
    if (!context) throw new Error('useDesktopSidebar requiere DesktopSidebarProvider');
    return context;
}
