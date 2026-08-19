'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
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
    modalBackdropDataAttr,
    pickModalPanelClassName,
    hasLiveModalParent,
    notifyModalHistoryClose,
    notifyModalHistoryOpen,
    registerModalHistory,
    registerModalSurface,
    requestModalClose,
    resolveModalVariant,
    subscribeModalHistory,
    getModalHistoryVersion,
    unregisterModalHistory,
    isModalSurfaceSubordinate,
    subscribeModalSurfaceStack,
    getModalSurfaceStackVersion,
    type ModalLayer,
    type ModalVariant,
} from '@/lib/design-system';

export type { ModalLayer, ModalVariant };

type ModalHeaderTone = 'white' | 'petroleum';
/** `plain` = sin marco/fondo (default contrato). `soft` = tratamiento explícito. */
type ModalHeaderActionChrome = 'plain' | 'soft';

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
     * Capa semántica (ADR-0007 / ADR-0008).
     * `derived` = máximo una sobre un `base`. Default `base`.
     */
    layer?: ModalLayer;
    /**
     * Identidad estable de instancia (= usageId). Independiente del título.
     */
    instance?: string;
    /**
     * Identidad semántica del padre de navegación. No se infiere por layer ni por cima de pila.
     * Un `base` puede tener padre; un `derived` no implica ←.
     */
    parentInstance?: string;
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
    /**
     * Tratamiento visual de botones de cabecera.
     * Default `plain` (sin borde/fondo). `soft` solo si se pide explícitamente.
     */
    headerActionChrome?: ModalHeaderActionChrome;
    hideHeaderDivider?: boolean;
    hideTitle?: boolean;
    hideHeader?: boolean;
    headerTrailing?: ReactNode;
    ariaLabel?: string;
    backdropClassName?: string;
    onBack?: () => void;
    onBackPlain?: boolean;
    loading?: boolean;
    /**
     * Conservado por compatibilidad. El inicio horizontal del título
     * lo fija el inset contractual de cabecera, no este flag.
     */
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

function headerActionClassName(
    petroleum: boolean,
    chrome: ModalHeaderActionChrome,
    opts?: { plainForce?: boolean }
) {
    const plain = opts?.plainForce || chrome === 'plain';
    return cn(
        /* Chrome independiente de Button: cuadrado = alto de cabecera (36px). */
        'flex h-full w-[var(--modal-header-height)] max-h-full min-h-0 shrink-0 items-center justify-center border-0 shadow-none ring-0 outline-none transition-opacity active:opacity-70',
        plain
            ? 'bg-transparent'
            : petroleum
              ? 'rounded-ds-control bg-white/10 text-white hover:bg-white/20'
              : 'rounded-ds-control bg-zinc-100 text-zinc-500 hover:bg-zinc-200',
        plain && (petroleum ? 'text-white/90 hover:opacity-100' : 'text-zinc-500 hover:opacity-80')
    );
}

function ModalPanelShell({
    title,
    titleId,
    subtitle,
    headerTone,
    headerActionChrome,
    onClose,
    onBack,
    onBackPlain = false,
    hideHeaderDivider,
    hideTitle = false,
    hideHeader = false,
    headerTrailing,
    headerTitleAlign: _headerTitleAlign = 'default',
    headerCompact = false,
    scrollContent = true,
    preferTall = false,
    className,
    children,
    footer,
    loading = false,
    hideCloseButton = false,
    isSubordinate = false,
    bodyRef,
}: {
    title: ReactNode;
    titleId: string;
    subtitle?: ReactNode;
    headerTone: ModalHeaderTone;
    headerActionChrome: ModalHeaderActionChrome;
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
    isSubordinate?: boolean;
    bodyRef?: RefObject<HTMLDivElement | null>;
}) {
    const petroleum = headerTone === 'petroleum';
    const actionChrome = onBackPlain ? 'plain' : headerActionChrome;
    const hasBack = Boolean(onBack);

    return (
        <div
            data-element="container"
            data-has-back={hasBack ? 'true' : undefined}
            data-header-compact={headerCompact ? 'true' : undefined}
            data-subordinate={isSubordinate ? 'true' : undefined}
            className={cn(
                'flex w-full max-w-full flex-col overflow-hidden overflow-x-hidden rounded-ds-superficie bg-ds-superficie shadow-ds-modal outline-none',
                'max-h-ds-modal',
                preferTall && 'min-h-[min(20rem,var(--modal-max-height))]',
                pickModalPanelClassName(className)
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
                        'relative flex h-ds-modal-header max-h-ds-modal-header min-h-ds-modal-header shrink-0 items-center overflow-hidden overflow-x-hidden',
                        petroleum ? 'bg-ds-marca text-white' : 'bg-ds-superficie text-ds-texto-fuerte',
                        headerCompact ? 'gap-ds-1' : 'gap-ds-2',
                        !hideHeaderDivider && !petroleum && 'border-b border-ds-borde'
                    )}
                >
                    {onBack ? (
                        <button
                            type="button"
                            aria-label="Volver"
                            data-element="back"
                            onClick={onBack}
                            className={headerActionClassName(petroleum, actionChrome, {
                                plainForce: onBackPlain,
                            })}
                        >
                            <ChevronLeft
                                className="h-[clamp(0.875rem,2.8vw,1rem)] w-[clamp(0.875rem,2.8vw,1rem)]"
                                strokeWidth={onBackPlain ? 2.25 : undefined}
                            />
                        </button>
                    ) : null}

                    {!hideTitle ? (
                        <div
                            data-element="heading"
                            className="flex min-h-0 min-w-0 flex-1 items-center gap-ds-2 overflow-hidden"
                        >
                            <h2
                                id={titleId}
                                className={cn(
                                    'min-w-0 overflow-hidden font-black uppercase tracking-wide truncate',
                                    'text-[clamp(0.5625rem,2.4vw,0.75rem)]',
                                    subtitle ? 'shrink' : 'flex-1',
                                    petroleum ? 'text-white' : 'text-ds-texto-fuerte'
                                )}
                            >
                                {title}
                            </h2>
                            {subtitle ? (
                                <div
                                    data-element="subtitle"
                                    className={cn(
                                        'min-w-0 flex-1 overflow-hidden truncate font-medium uppercase tracking-wide',
                                        'text-[clamp(0.4375rem,1.8vw,0.5625rem)]',
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

                    <div className="ml-auto flex h-full shrink-0 items-center gap-0.5 overflow-hidden">
                        {headerTrailing}
                        {!hideCloseButton ? (
                            <button
                                type="button"
                                aria-label="Cerrar modal"
                                onClick={onClose}
                                className={headerActionClassName(petroleum, headerActionChrome)}
                            >
                                <X
                                    className="h-[clamp(0.875rem,2.8vw,1rem)] w-[clamp(0.875rem,2.8vw,1rem)]"
                                    strokeWidth={2.5}
                                />
                            </button>
                        ) : null}
                    </div>
                </div>
            )}

            <div
                ref={bodyRef}
                data-element="body"
                className={cn(
                    'relative flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden',
                    scrollContent ? 'overflow-y-auto overscroll-contain' : 'overflow-y-hidden'
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
                    className="flex max-w-full shrink-0 items-center overflow-x-hidden border-t border-ds-borde bg-ds-superficie py-ds-3"
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
    parentInstance,
    footer,
    className,
    containerClassName,
    wrapperClassName,
    panelHostClassName,
    subtitle,
    headerVariant,
    headerTone: headerToneProp,
    headerActionChrome = 'plain',
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
    const bodyRef = useRef<HTMLDivElement>(null);
    const openedAtRef = useRef<number | null>(null);
    const trackedLabelRef = useRef<string | null>(null);
    const [derivedBlocked, setDerivedBlocked] = useState(false);
    const [restoredOpen, setRestoredOpen] = useState(false);
    const historyVersion = useSyncExternalStore(
        subscribeModalHistory,
        getModalHistoryVersion,
        getModalHistoryVersion
    );
    const stackVersion = useSyncExternalStore(
        subscribeModalSurfaceStack,
        getModalSurfaceStackVersion,
        getModalSurfaceStackVersion
    );

    const headerTone = headerToneProp ?? headerVariant ?? 'petroleum';
    const layout = resolveModalVariant(variant);

    const layer: ModalLayer = layerProp
        ?? (stackElevated ? 'system' : 'base');
    const participatesInHistory = layer !== 'system';
    const consumerVisible = open || restoredOpen;
    const visible = consumerVisible && !derivedBlocked;

    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const restoreRef = useRef(() => {
        setRestoredOpen(true);
    });
    restoreRef.current = () => {
        setRestoredOpen(true);
    };

    const requestClose = () => {
        setRestoredOpen(false);
        if (!participatesInHistory || !requestModalClose(surfaceId)) {
            onCloseRef.current();
        }
    };
    const requestCloseRef = useRef(requestClose);
    requestCloseRef.current = requestClose;

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
        if (open) setRestoredOpen(false);
    }, [open]);

    useLayoutEffect(() => {
        if (!participatesInHistory) return;
        return () => {
            unregisterModalHistory(surfaceId);
        };
    }, [participatesInHistory, surfaceId]);

    useEffect(() => {
        if (!consumerVisible) {
            setDerivedBlocked(false);
            if (participatesInHistory) notifyModalHistoryClose(surfaceId);
            return;
        }

        const registration = registerModalSurface({
            id: surfaceId,
            layer,
            onEscape: () => requestCloseRef.current(),
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
        if (participatesInHistory) {
            registerModalHistory({
                surfaceId,
                instance: resolvedInstance ?? resolvedUsageId,
                parentInstance,
                layer,
                dismiss: () => onCloseRef.current(),
                restore: () => restoreRef.current(),
            });
            notifyModalHistoryOpen(surfaceId);
        }
        const unlockScroll = lockScrollGlobal();
        panelRef.current?.focus();

        return () => {
            registration.unregister();
            unlockScroll();
        };
    }, [
        consumerVisible,
        layer,
        surfaceId,
        participatesInHistory,
        resolvedInstance,
        resolvedUsageId,
        parentInstance,
    ]);

    useEffect(() => {
        if (process.env.NODE_ENV === 'production' || !visible) return;
        const root = bodyRef.current;
        if (!root) return;

        const offenders: Element[] = [];
        for (const btn of root.querySelectorAll('button')) {
            if (btn.closest('[data-component="Button"]')) continue;
            offenders.push(btn);
        }

        for (const btn of offenders) {
            console.warn(
                '[Modal] Botón ad-hoc en body: usar @/components/ui/button (Button Contract).',
                btn
            );
        }
    }, [children, visible]);

    const showNavBack = participatesInHistory && hasLiveModalParent(surfaceId);
    void historyVersion;
    void stackVersion;
    const backHandler = showNavBack ? () => requestCloseRef.current() : onBack;
    const isSubordinate = visible && isModalSurfaceSubordinate(surfaceId);

    if (!visible) return null;

    const zClass = zIndexClass ?? MODAL_LAYER_Z_CLASS[layer];
    const backdropKind = modalBackdropDataAttr(layer);

    return createPortal(
        <div
            data-component={MODAL_COMPONENT_ID}
            data-variant={variant}
            data-instance={resolvedUsageId}
            data-parent-instance={parentInstance || undefined}
            data-layer={layer}
            className={cn(
                'fixed inset-0 box-border flex items-center justify-center animate-in fade-in duration-200',
                zClass,
                containerClassName
            )}
            style={{
                paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
                paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
                paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
                paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
            }}
        >
            <button
                type="button"
                data-element="overlay"
                data-modal-backdrop={backdropKind}
                aria-label="Cerrar"
                className={cn(
                    'absolute inset-0 touch-none overscroll-none border-0 p-0',
                    backdropClassName
                )}
                onClick={closeOnBackdrop ? () => requestCloseRef.current() : undefined}
            />
            <div
                className={cn(
                    'relative z-10 flex w-full max-w-full flex-col items-center pointer-events-none',
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
                    data-subordinate={isSubordinate ? 'true' : undefined}
                    className={cn(
                        'pointer-events-auto w-full max-w-full outline-none transition-[filter,opacity] duration-200',
                        isSubordinate && 'pointer-events-none',
                        panelHostClassName
                    )}
                >
                    <ModalPanelShell
                        title={title}
                        titleId={titleId}
                        subtitle={subtitle}
                        headerTone={headerTone}
                        headerActionChrome={headerActionChrome}
                        onClose={() => requestCloseRef.current()}
                        onBack={backHandler}
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
                        isSubordinate={isSubordinate}
                        bodyRef={bodyRef}
                    >
                        {children}
                    </ModalPanelShell>
                </div>
            </div>
        </div>,
        document.body
    );
}
