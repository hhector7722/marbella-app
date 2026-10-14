'use client';

import { useEffect } from 'react';
import { Columns2, X } from 'lucide-react';

/**
 * Cada iframe es un contexto de navegación completo de la MISMA aplicación:
 * tiene su propia ruta, historial, modales, selectores, scroll y estado React.
 * Comparten necesariamente el usuario autenticado y los datos del servidor.
 */
export default function DashboardSplitWorkspace({
    initialPath,
    onClose,
}: {
    initialPath: string;
    onClose: () => void;
}) {
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        const desktop = window.matchMedia('(min-width: 1024px)');
        const onViewportChange = () => {
            if (!desktop.matches) onClose();
        };

        window.addEventListener('keydown', onKeyDown);
        desktop.addEventListener('change', onViewportChange);
        onViewportChange();
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
            desktop.removeEventListener('change', onViewportChange);
        };
    }, [onClose]);

    return (
        <section
            data-component="DashboardSplitWorkspace"
            aria-label="Dos pantallas independientes de La Marbella"
            className="dashboard-split-workspace fixed inset-0 z-[200] flex flex-col overflow-hidden bg-[var(--color-envolvente)] print:hidden"
        >
            <div className="dashboard-split-toolbar flex h-11 shrink-0 items-center justify-between gap-3 border-b border-white/20 bg-[var(--color-envolvente-bajo)] px-4 text-white">
                <div className="flex min-w-0 items-center gap-2 text-xs font-semibold">
                    <Columns2 size={16} aria-hidden />
                    <span>Dos pantallas independientes</span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/75 bg-transparent px-3 py-1 text-xs font-semibold text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    aria-label="Salir de pantalla dividida"
                >
                    <X size={15} aria-hidden />
                    Unir pantalla
                </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-2">
                <div className="relative min-h-0 min-w-0 overflow-hidden border-r border-white/40">
                    <iframe
                        title="La Marbella — pantalla izquierda"
                        src={initialPath}
                        className="block h-full w-full border-0 bg-[var(--color-envolvente)]"
                    />
                </div>
                <div className="relative min-h-0 min-w-0 overflow-hidden">
                    <iframe
                        title="La Marbella — pantalla derecha"
                        src={initialPath}
                        className="block h-full w-full border-0 bg-[var(--color-envolvente)]"
                    />
                </div>
            </div>
        </section>
    );
}
