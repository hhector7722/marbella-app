'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { lockScrollGlobal } from '@/hooks/useScrollLock';
import { cn } from '@/lib/utils';
import {
    CONSUMPTION_BOTTOM_SHEET_COMPONENT_ID,
    MODAL_LAYER_Z_CLASS,
    modalBackdropDataAttr,
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

    const backdropKind = modalBackdropDataAttr('sheet');

    return createPortal(
        <div
            data-component={CONSUMPTION_BOTTOM_SHEET_COMPONENT_ID}
            data-variant="sheet"
            data-instance={instance}
            data-layer="sheet"
            className={cn(
                'fixed inset-0 box-border flex items-end justify-center sm:items-center',
                'animate-in fade-in duration-200',
                MODAL_LAYER_Z_CLASS.sheet
            )}
            style={{
                paddingTop: 'max(0px, env(safe-area-inset-top, 0px))',
                paddingBottom: 'max(0px, env(safe-area-inset-bottom, 0px))',
                paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
                paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
            }}
        >
            <button
                type="button"
                data-element="overlay"
                data-modal-backdrop={backdropKind}
                aria-label="Cerrar"
                className="absolute inset-0 touch-none overscroll-none border-0 p-0"
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
                    'relative z-10 flex w-full max-w-lg flex-col overflow-hidden overflow-x-hidden bg-ds-superficie shadow-ds-modal outline-none pointer-events-auto',
                    'max-h-ds-modal rounded-t-ds-superficie sm:rounded-ds-superficie',
                    'animate-in slide-in-from-bottom duration-200 sm:zoom-in-95',
                    className
                )}
            >
                <div
                    data-element="header"
                    className="flex h-ds-modal-header max-h-ds-modal-header min-h-ds-modal-header shrink-0 items-center gap-ds-2 overflow-hidden overflow-x-hidden border-b border-ds-borde px-ds-4"
                >
                    <h2
                        id={titleId}
                        className="min-w-0 flex-1 overflow-hidden break-words font-black uppercase tracking-wide leading-none text-ds-texto-fuerte text-[clamp(0.5625rem,2.4vw,0.75rem)]"
                    >
                        {title}
                    </h2>
                    {!hideCloseButton ? (
                        <button
                            type="button"
                            aria-label="Cerrar"
                            onClick={onClose}
                            className="flex h-full w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-500 shadow-none ring-0 outline-none hover:opacity-80"
                        >
                            <X
                                className="h-[clamp(0.875rem,2.8vw,1rem)] w-[clamp(0.875rem,2.8vw,1rem)]"
                                strokeWidth={2.5}
                            />
                        </button>
                    ) : null}
                </div>
                <div
                    data-element="body"
                    className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
                >
                    {children}
                </div>
                {footer ? (
                    <div
                        data-element="footer"
                        className="flex max-w-full shrink-0 items-center gap-ds-2 overflow-x-hidden border-t border-ds-borde px-ds-4 py-ds-3"
                    >
                        <div data-element="footer-actions">{footer}</div>
                    </div>
                ) : null}
            </div>
        </div>,
        document.body
    );
}
