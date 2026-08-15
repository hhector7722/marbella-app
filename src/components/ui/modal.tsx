'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { trackUsageModalDwell, trackUsageModalOpen } from '@/lib/usage/client';
import { lockScrollGlobal } from '@/hooks/useScrollLock';
import { cn } from '@/lib/utils';
import {
    MODAL_COMPONENT_ID,
    MODAL_LAYER_Z_CLASS,
    registerModalSurface,
    resolveModalVariant,
    type ModalLayer,
    type ModalVariant,
} from '@/lib/design-system';

export type { ModalLayer, ModalVariant };

type ModalHeaderTone = 'white' | 'petroleum';

export type ModalProps = {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    children: ReactNode;
    /**
     * Variante estructural oficial.
     * Default `compact` (= max-w-sm histórico).
     */
    variant?: ModalVariant;
    /**
     * Capa semántica (ADR-0007).
     * `derived` = máximo una sobre un `base`. Default `base`.
     */
    layer?: ModalLayer;
    /**
     * Identidad estable de instancia (= usageId). Independiente del título.
     */
    instance?: string;
    /** Acciones fijas bajo el Body (no hacen scroll con el contenido). */
    footer?: ReactNode;
    className?: string;
    containerClassName?: string;
    wrapperClassName?: string;
    panelHostClassName?: string;
    subtitle?: ReactNode;
    /** @deprecated Preferir `headerTone`. */
    headerVariant?: ModalHeaderTone;
    headerTone?: ModalHeaderTone;
    hideHeaderDivider?: boolean;
    hideTitle?: boolean;
    hideHeader?: boolean;
    headerTrailing?: ReactNode;
    ariaLabel?: string;
    backdropClassName?: string;
    onBack?: () => void;
    onBackPlain?: boolean;
    loading?: boolean;
    headerTitleAlign?: 'left' | 'default';
    headerCompact?: boolean;
    scrollContent?: boolean;
    /**
     * @deprecated Preferir `layer="system"`.
     * Conservado por compatibilidad (antes z-[110]).
     */
    stackElevated?: boolean;
    hideCloseButton?: boolean;
    usageId?: string;
    usageLabel?: string;
    disableUsageTracking?: boolean;
    /**
     * @deprecated Preferir `layer`. Escape hatch temporal para consumidores legacy.
     */
    zIndexClass?: string;
    /** Clic en backdrop cierra. Default true. */
    closeOnBackdrop?: boolean;
};

function ModalPanelShell({
    title,
    titleId,
    subtitle,
    headerTone,
    onClose,
    onBack,
    onBackPlain = false,
    hideHeaderDivider,
    hideTitle = false,
    hideHeader = false,
    headerTrailing,
    headerTitleAlign = 'default',
    headerCompact = false,
    scrollContent = true,
    preferTall = false,
    className,
    children,
    footer,
    loading = false,
    hideCloseButton = false,
}: {
    title: ReactNode;
    titleId: string;
    subtitle?: ReactNode;
    headerTone: ModalHeaderTone;
    onClose: () => void;
    onBack?: () => void;
    onBackPlain?: boolean;
    hideHeaderDivider?: boolean;
    hideTitle?: boolean;
    hideHeader?: boolean;
    headerTrailing?: ReactNode;
    headerTitleAlign?: 'left' | 'default';
    headerCompact?: boolean;
    scrollContent?: boolean;
    preferTall?: boolean;
    className?: string;
    children: ReactNode;
    footer?: ReactNode;
    loading?: boolean;
    hideCloseButton?: boolean;
}) {
    const petroleum = headerTone === 'petroleum';
    const titleLeft = headerTitleAlign === 'left';

    return (
        <div
            data-element="container"
            className={cn(
                'flex w-full flex-col overflow-hidden rounded-ds-superficie bg-ds-superficie shadow-ds-modal outline-none',
                'max-h-ds-modal',
                preferTall && 'min-h-[min(20rem,var(--modal-max-height))]',
                className
            )}
        >
            {hideHeader ? (
                <span id={titleId} className="sr-only">
                    {title}
                </span>
            ) : (
                <div
                    data-element="header"
                    className={cn(
                        'relative flex min-h-ds-tactil shrink-0 items-center gap-ds-2',
                        petroleum ? 'bg-ds-marca text-white shadow-ds-superficie' : 'bg-ds-superficie text-ds-texto-fuerte',
                        headerCompact ? 'px-ds-2 py-ds-2' : 'px-ds-4 py-ds-3',
                        !hideHeaderDivider && !petroleum && 'border-b border-ds-borde'
                    )}
                >
                    {onBack ? (
                        <button
                            type="button"
                            aria-label="Volver"
                            onClick={onBack}
                            className={cn(
                                'flex min-h-ds-tactil min-w-ds-tactil shrink-0 items-center justify-center transition-colors active:opacity-70',
                                onBackPlain
                                    ? 'border-0 bg-transparent shadow-none'
                                    : 'rounded-ds-control',
                                onBackPlain
                                    ? petroleum
                                        ? 'text-white'
                                        : 'text-zinc-700'
                                    : petroleum
                                      ? 'bg-white/10 text-white hover:bg-white/20'
                                      : 'text-zinc-500 hover:bg-zinc-100'
                            )}
                        >
                            <ChevronLeft className="h-5 w-5" strokeWidth={onBackPlain ? 2.25 : undefined} />
                        </button>
                    ) : (
                        <span className={cn('shrink-0', hideTitle || titleLeft ? 'w-0' : 'min-w-ds-tactil')} aria-hidden />
                    )}

                    {!hideTitle ? (
                        <div className={cn('min-w-0 flex-1', titleLeft ? 'text-left' : '')}>
                            <h2
                                id={titleId}
                                className={cn(
                                    'truncate font-black uppercase tracking-wide',
                                    headerCompact ? 'text-xs' : petroleum ? 'text-lg' : 'text-sm',
                                    petroleum ? 'text-white' : 'text-ds-texto-fuerte'
                                )}
                            >
                                {title}
                            </h2>
                            {subtitle ? (
                                <div
                                    className={cn(
                                        'mt-1 text-[10px] font-black uppercase tracking-[0.2em]',
                                        petroleum ? 'text-white/70' : 'text-zinc-500'
                                    )}
                                >
                                    {subtitle}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div id={titleId} className="min-w-0 flex-1" />
                    )}

                    <div className="ml-auto flex shrink-0 items-center gap-ds-2">
                        {headerTrailing}
                        {!hideCloseButton ? (
                            <button
                                type="button"
                                aria-label="Cerrar modal"
                                onClick={onClose}
                                className={cn(
                                    'flex min-h-ds-tactil min-w-ds-tactil shrink-0 items-center justify-center rounded-ds-control transition-all active:scale-95',
                                    petroleum
                                        ? 'bg-white/10 text-white hover:bg-white/20'
                                        : 'text-zinc-500 hover:bg-zinc-100'
                                )}
                            >
                                <X className="h-5 w-5" strokeWidth={2.5} />
                            </button>
                        ) : null}
                    </div>
                </div>
            )}

            <div
                data-element="body"
                className={cn(
                    'relative flex min-h-0 flex-1 flex-col',
                    scrollContent ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'
                )}
            >
                {children}
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-ds-superficie/80">
                        <LoadingSpinner size="lg" className="text-ds-marca" />
                    </div>
                ) : null}
            </div>

            {footer ? (
                <div
                    data-element="footer"
                    className="flex shrink-0 items-center gap-ds-2 border-t border-ds-borde bg-ds-superficie px-ds-4 py-ds-3"
                >
                    {footer}
                </div>
            ) : null}
        </div>
    );
}

/**
 * Contrato oficial de Modal de Marbella.
 * Portal único, capas semánticas, Footer fijo, identidad estable.
 */
export function Modal({
    open,
    onClose,
    title,
    children,
    variant = 'compact',
    layer: layerProp,
    instance,
    footer,
    className,
    containerClassName,
    wrapperClassName,
    panelHostClassName,
    subtitle,
    headerVariant,
    headerTone: headerToneProp,
    hideHeaderDivider = false,
    hideTitle = false,
    hideHeader = false,
    ariaLabel,
    backdropClassName,
    onBack,
    onBackPlain = false,
    loading = false,
    headerTrailing,
    headerTitleAlign = 'default',
    headerCompact = false,
    scrollContent = true,
    stackElevated = false,
    hideCloseButton = false,
    usageId,
    usageLabel,
    disableUsageTracking = false,
    zIndexClass,
    closeOnBackdrop = true,
}: ModalProps) {
    const titleId = useId();
    const surfaceId = useId();
    const pathname = usePathname();
    const panelRef = useRef<HTMLDivElement>(null);
    const openedAtRef = useRef<number | null>(null);
    const trackedLabelRef = useRef<string | null>(null);
    const [derivedBlocked, setDerivedBlocked] = useState(false);

    const headerTone = headerToneProp ?? headerVariant ?? 'white';
    const layout = resolveModalVariant(variant);

    const layer: ModalLayer = layerProp
        ?? (stackElevated ? 'system' : 'base');

    const resolvedInstance = instance ?? usageId;
    const resolvedUsageLabel =
        usageLabel ??
        (typeof title === 'string' ? title : ariaLabel) ??
        resolvedInstance ??
        'Modal';
    const resolvedUsageId =
        resolvedInstance ??
        resolvedUsageLabel
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

    useEffect(() => {
        if (disableUsageTracking) return;

        if (!open) {
            if (openedAtRef.current != null && trackedLabelRef.current) {
                trackUsageModalDwell(
                    resolvedUsageId,
                    trackedLabelRef.current,
                    pathname,
                    Date.now() - openedAtRef.current
                );
            }
            openedAtRef.current = null;
            trackedLabelRef.current = null;
            return;
        }

        const now = Date.now();
        if (
            openedAtRef.current != null &&
            trackedLabelRef.current &&
            trackedLabelRef.current !== resolvedUsageLabel
        ) {
            trackUsageModalDwell(
                resolvedUsageId,
                trackedLabelRef.current,
                pathname,
                now - openedAtRef.current
            );
            trackUsageModalOpen(resolvedUsageId, resolvedUsageLabel, pathname);
            openedAtRef.current = now;
        } else if (openedAtRef.current == null) {
            trackUsageModalOpen(resolvedUsageId, resolvedUsageLabel, pathname);
            openedAtRef.current = now;
        }

        trackedLabelRef.current = resolvedUsageLabel;
    }, [disableUsageTracking, open, pathname, resolvedUsageId, resolvedUsageLabel]);

    useEffect(() => {
        if (!open) {
            setDerivedBlocked(false);
            return;
        }

        const registration = registerModalSurface({
            id: surfaceId,
            layer,
            onEscape: onClose,
        });

        if (!registration.ok) {
            setDerivedBlocked(true);
            if (process.env.NODE_ENV !== 'production') {
                const hint =
                    registration.reason === 'derived-without-base'
                        ? 'Una superficie derived exige un Modal base abierto.'
                        : 'Solo se permite una superficie derivada (ADR-0007). No se abre una tercera capa.';
                console.error(`[Modal] ${hint}`);
            }
            return;
        }

        setDerivedBlocked(false);
        const unlockScroll = lockScrollGlobal();
        panelRef.current?.focus();

        return () => {
            registration.unregister();
            unlockScroll();
        };
    }, [open, onClose, layer, surfaceId]);

    if (!open || derivedBlocked) return null;

    const zClass = zIndexClass ?? MODAL_LAYER_Z_CLASS[layer];

    return createPortal(
        <div
            data-component={MODAL_COMPONENT_ID}
            data-variant={variant}
            data-instance={resolvedUsageId}
            data-layer={layer}
            className={cn(
                'fixed inset-0 flex items-center justify-center p-ds-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] animate-in fade-in duration-200',
                zClass,
                containerClassName
            )}
        >
            <button
                type="button"
                data-element="overlay"
                aria-label="Cerrar"
                className={cn(
                    'absolute inset-0 touch-none overscroll-none backdrop-blur-sm',
                    backdropClassName
                )}
                style={{ backgroundColor: 'var(--modal-overlay)' }}
                onClick={closeOnBackdrop ? onClose : undefined}
            />
            <div
                className={cn(
                    'relative z-10 flex w-full flex-col items-center pointer-events-none',
                    layout.maxWidthClass,
                    wrapperClassName
                )}
            >
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={hideHeader ? undefined : titleId}
                    aria-label={
                        hideHeader
                            ? (ariaLabel ?? (typeof title === 'string' ? title : undefined))
                            : hideTitle
                              ? ariaLabel
                              : undefined
                    }
                    tabIndex={-1}
                    className={cn('pointer-events-auto w-full outline-none', panelHostClassName)}
                >
                    <ModalPanelShell
                        title={title}
                        titleId={titleId}
                        subtitle={subtitle}
                        headerTone={headerTone}
                        onClose={onClose}
                        onBack={onBack}
                        onBackPlain={onBackPlain}
                        hideHeaderDivider={hideHeaderDivider}
                        hideTitle={hideTitle}
                        hideHeader={hideHeader}
                        headerTrailing={headerTrailing}
                        headerTitleAlign={headerTitleAlign}
                        headerCompact={headerCompact}
                        scrollContent={scrollContent}
                        preferTall={layout.preferTall}
                        className={className}
                        loading={loading}
                        hideCloseButton={hideCloseButton}
                        footer={footer}
                    >
                        {children}
                    </ModalPanelShell>
                </div>
            </div>
        </div>,
        document.body
    );
}
