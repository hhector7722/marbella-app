'use client';

import type { ReactNode } from 'react';

/**
 * Rejilla de atajos iOS (DashboardShortcut) para modales de acceso.
 * Misma medida de icono que el mosaico de inicio.
 */
export function AccessShortcutGrid({ children }: { children: ReactNode }) {
    return (
        <div data-component="AccessShortcutGrid">
            {children}
        </div>
    );
}
