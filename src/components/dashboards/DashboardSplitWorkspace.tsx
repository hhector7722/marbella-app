'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Columns2, X } from 'lucide-react';

const DIVIDER_WIDTH = 10;
const MIN_PANE_WIDTH = 320;

function splitBounds(containerWidth: number) {
    const available = Math.max(containerWidth - DIVIDER_WIDTH, 1);
    const minimum = Math.min(50, (MIN_PANE_WIDTH / available) * 100);
    return { minimum, maximum: 100 - minimum };
}

function clampSplit(percent: number, containerWidth: number) {
    const { minimum, maximum } = splitBounds(containerWidth);
    return Math.min(maximum, Math.max(minimum, percent));
}

/**
 * Cada iframe es un contexto de navegación completo de la MISMA aplicación:
 * tiene su propia ruta, historial, modales, selectores, scroll y estado React.
 * Comparten necesariamente el usuario autenticado y los datos del servidor.
 *
 * Las mitades cambian de ancho sin remontar ninguno de los iframes, para
 * conservar su navegación y los formularios abiertos mientras se arrastra.
 */
export default function DashboardSplitWorkspace({
    initialPath,
    onClose,
}: {
    initialPath: string;
    onClose: () => void;
}) {
    const panesRef = useRef<HTMLDivElement>(null);
    const activePointerRef = useRef<number | null>(null);
    const [leftPercent, setLeftPercent] = useState(50);
    const [containerWidth, setContainerWidth] = useState(0);
    const [isResizing, setIsResizing] = useState(false);

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

    // Window/device scale can change without changing the browser's zoom.
    // Re-clamp both panes when the actual available CSS width changes.
    useEffect(() => {
        const element = panesRef.current;
        if (!element) return;
        const measure = () => {
            const width = element.getBoundingClientRect().width;
            setContainerWidth(width);
            setLeftPercent(current => clampSplit(current, width));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const updateFromClientX = useCallback((clientX: number) => {
        const rect = panesRef.current?.getBoundingClientRect();
        if (!rect) return;
        const available = Math.max(rect.width - DIVIDER_WIDTH, 1);
        const percentage = ((clientX - rect.left - DIVIDER_WIDTH / 2) / available) * 100;
        setLeftPercent(clampSplit(percentage, rect.width));
    }, []);

    const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        activePointerRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsResizing(true);
    };

    // Capture keeps the drag alive when crossing either iframe. The temporary
    // overlay additionally blocks iframe interaction during a resize.
    useEffect(() => {
        if (!isResizing) return;
        const move = (event: PointerEvent) => {
            if (event.pointerId === activePointerRef.current) {
                updateFromClientX(event.clientX);
            }
        };
        const stop = (event: PointerEvent) => {
            if (event.pointerId !== activePointerRef.current) return;
            activePointerRef.current = null;
            setIsResizing(false);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
            window.removeEventListener('pointercancel', stop);
        };
    }, [isResizing, updateFromClientX]);

    const onDividerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        const { minimum, maximum } = splitBounds(containerWidth || window.innerWidth);
        const amount = event.shiftKey ? 10 : 2;
        let next: number;
        switch (event.key) {
            case 'ArrowLeft': next = leftPercent - amount; break;
            case 'ArrowRight': next = leftPercent + amount; break;
            case 'Home': next = minimum; break;
            case 'End': next = maximum; break;
            default: return;
        }
        event.preventDefault();
        setLeftPercent(Math.max(minimum, Math.min(maximum, next)));
    };

    const { minimum, maximum } = splitBounds(containerWidth || 1024);
    const roundedPercent = Math.round(leftPercent);

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
            <div
                ref={panesRef}
                className="relative grid min-h-0 flex-1 overflow-hidden"
                style={{
                    gridTemplateColumns: `minmax(0, ${leftPercent}fr) ${DIVIDER_WIDTH}px minmax(0, ${100 - leftPercent}fr)`,
                }}
            >
                <div className="relative min-h-0 min-w-0 overflow-hidden">
                    <iframe
                        title="La Marbella — pantalla izquierda"
                        src={initialPath}
                        className="block h-full w-full border-0 bg-[var(--color-envolvente)]"
                    />
                </div>
                <div
                    role="separator"
                    aria-label="Ajustar ancho de las dos pantallas"
                    aria-orientation="vertical"
                    aria-valuemin={Math.ceil(minimum)}
                    aria-valuemax={Math.floor(maximum)}
                    aria-valuenow={roundedPercent}
                    aria-valuetext={`${roundedPercent} % izquierda, ${100 - roundedPercent} % derecha`}
                    tabIndex={0}
                    title="Arrastra para cambiar el ancho de las pantallas. Doble clic para 50/50."
                    onPointerDown={beginResize}
                    onKeyDown={onDividerKeyDown}
                    onDoubleClick={() => setLeftPercent(50)}
                    className="relative z-30 flex h-full w-[10px] cursor-col-resize touch-none select-none items-center justify-center border-x border-white/20 bg-white/[0.06] transition-colors hover:bg-sky-400/25 focus-visible:bg-sky-400/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                >
                    <span aria-hidden="true" className="pointer-events-none h-10 w-[3px] rounded-full bg-white/55" />
                </div>
                <div className="relative min-h-0 min-w-0 overflow-hidden">
                    <iframe
                        title="La Marbella — pantalla derecha"
                        src={initialPath}
                        className="block h-full w-full border-0 bg-[var(--color-envolvente)]"
                    />
                </div>
                {isResizing && (
                    <div aria-hidden="true" className="absolute inset-0 z-20 cursor-col-resize" />
                )}
            </div>
        </section>
    );
}
