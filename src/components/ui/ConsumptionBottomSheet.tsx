'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { lockScrollGlobal } from '@/hooks/useScrollLock';
import { cn } from '@/lib/utils';
import {
    CONSUMPTION_BOTTOM_SHEET_COMPONENT_ID,
    MODAL_LAYER_Z_CLASS,
    registerModalSurface,
} from '@/lib/design-system';

export { CONSUMPTION_BOTTOM_SHEET_COMPONENT_ID };

export type ConsumptionBottomSheetProps = {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    /** Identidad estable (usageId). */
    instance: string;
    className?: string;
    closeOnBackdrop?: boolean;
    hideCloseButton?: boolean;
};

/**
 * EXCEPCIÓN explícita al Modal centrado: hoja inferior de consumo.
 * Comparte portal, capas, Escape, scroll lock e identidad con Modal.
 * No es una vía libre para nuevos overlays ad hoc.
 */
export function ConsumptionBottomSheet({
    open,
    onClose,
    title,
    children,
    footer,
    instance,
    className,
    closeOnBackdrop = true,
    hideCloseButton = false,
}: ConsumptionBottomSheetProps) {
    const titleId = useId();
    const surfaceId = useId();
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        const registration = registerModalSurface({
            id: surfaceId,
            layer: 'sheet',
            onEscape: onClose,
        });
        if (!registration.ok) return;

        const unlockScroll = lockScrollGlobal();
        panelRef.current?.focus();

        return () => {
            registration.unregister();
            unlockScroll();
        };
    }, [open, onClose, surfaceId]);

    if (!open) return null;

    return createPortal(
        <div
            data-component={CONSUMPTION_BOTTOM_SHEET_COMPONENT_ID}
            data-variant="sheet"
            data-instance={instance}
            data-layer="sheet"
            className={cn(
                'fixed inset-0 flex items-end justify-center sm:items-center sm:p-ds-4',
                'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
                'animate-in fade-in duration-200',
                MODAL_LAYER_Z_CLASS.sheet
            )}
        >
            <button
                type="button"
                data-element="overlay"
                aria-label="Cerrar"
                className="absolute inset-0 touch-none overscroll-none backdrop-blur-sm"
                style={{ backgroundColor: 'var(--modal-overlay)' }}
                onClick={closeOnBackdrop ? onClose : undefined}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                data-element="container"
                className={cn(
                    'relative z-10 flex w-full max-w-lg flex-col overflow-hidden bg-ds-superficie shadow-ds-modal outline-none pointer-events-auto',
                    'max-h-ds-modal rounded-t-ds-superficie sm:rounded-ds-superficie',
                    'animate-in slide-in-from-bottom duration-200 sm:zoom-in-95',
                    className
                )}
            >
                <div
                    data-element="header"
                    className="flex min-h-ds-tactil shrink-0 items-center gap-ds-2 border-b border-ds-borde px-ds-4 py-ds-3"
                >
                    <h2
                        id={titleId}
                        className="min-w-0 flex-1 truncate text-sm font-black uppercase tracking-wide text-ds-texto-fuerte"
                    >
                        {title}
                    </h2>
                    {!hideCloseButton ? (
                        <button
                            type="button"
                            aria-label="Cerrar"
                            onClick={onClose}
                            className="flex min-h-ds-tactil min-w-ds-tactil shrink-0 items-center justify-center rounded-ds-control text-zinc-500 hover:bg-zinc-100 active:scale-95"
                        >
                            <X className="h-5 w-5" strokeWidth={2.5} />
                        </button>
                    ) : null}
                </div>
                <div
                    data-element="body"
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                >
                    {children}
                </div>
                {footer ? (
                    <div
                        data-element="footer"
                        className="flex shrink-0 items-center gap-ds-2 border-t border-ds-borde px-ds-4 py-ds-3"
                    >
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>,
        document.body
    );
}
