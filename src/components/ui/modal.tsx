'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { trackUsageModalDwell, trackUsageModalOpen } from '@/lib/usage/client';
import { cn } from '@/lib/utils';

type ModalHeaderVariant = 'white' | 'petroleum';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  wrapperClassName?: string;
  panelHostClassName?: string;
  subtitle?: ReactNode;
  headerVariant?: ModalHeaderVariant;
  hideHeaderDivider?: boolean;
  hideTitle?: boolean;
  hideHeader?: boolean;
  headerTrailing?: ReactNode;
  ariaLabel?: string;
  backdropClassName?: string;
  onBack?: () => void;
  /** Flecha atrás sin marco/relleno (p. ej. plantilla desde /profile) */
  onBackPlain?: boolean;
  loading?: boolean;
  headerTitleAlign?: 'left' | 'default';
  headerCompact?: boolean;
  scrollContent?: boolean;
  stackElevated?: boolean;
  hideCloseButton?: boolean;
  usageId?: string;
  usageLabel?: string;
  disableUsageTracking?: boolean;
  zIndexClass?: string;
};

import { lockScrollGlobal } from '@/hooks/useScrollLock';

function ModalPanelShell({
  title,
  titleId,
  subtitle,
  headerVariant,
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
  className,
  children,
  loading = false,
  hideCloseButton = false,
}: {
  title: ReactNode;
  titleId: string;
  subtitle?: ReactNode;
  headerVariant: ModalHeaderVariant;
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
  className?: string;
  children: ReactNode;
  loading?: boolean;
  hideCloseButton?: boolean;
}) {
  const petroleum = headerVariant === 'petroleum';
  const titleLeft = headerTitleAlign === 'left';

  return (
    <div
      className={cn(
        'flex w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none',
        'max-h-[calc(100dvh-2rem)]',
        className
      )}
    >
      {hideHeader ? (
        <span id={titleId} className="sr-only">
          {title}
        </span>
      ) : (
        <div
          className={cn(
            'relative flex shrink-0 items-center gap-2',
            petroleum ? 'bg-[#36606F] text-white shadow-md' : 'bg-white text-zinc-800',
            headerCompact ? 'px-2 py-2' : 'px-4 py-3',
            !hideHeaderDivider && !petroleum && 'border-b border-zinc-100'
          )}
        >
          {onBack ? (
            <button
              type="button"
              aria-label="Volver"
              onClick={onBack}
              className={cn(
                'flex shrink-0 items-center justify-center transition-colors active:opacity-70',
                onBackPlain
                  ? 'min-h-12 min-w-12 border-0 bg-transparent shadow-none'
                  : 'h-10 w-10 rounded-xl',
                onBackPlain
                  ? petroleum
                    ? 'text-white'
                    : 'text-zinc-700'
                  : petroleum
                    ? 'bg-white/10 hover:bg-white/20 text-white'
                    : 'text-zinc-500 hover:bg-zinc-100'
              )}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={onBackPlain ? 2.25 : undefined} />
            </button>
          ) : (
            <span className={cn('shrink-0', hideTitle || titleLeft ? 'w-0' : 'w-10')} aria-hidden />
          )}

          {!hideTitle ? (
            <div className={cn('min-w-0 flex-1', titleLeft ? 'text-left' : '')}>
              <h2
                id={titleId}
                className={cn(
                  'truncate font-black uppercase tracking-wide',
                  headerCompact ? 'text-xs' : petroleum ? 'text-lg' : 'text-sm',
                  petroleum ? 'text-white' : 'text-zinc-800'
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

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {headerTrailing}
            {!hideCloseButton ? (
              <button
                type="button"
                aria-label="Cerrar modal"
                onClick={onClose}
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95',
                  petroleum
                    ? 'bg-white/10 hover:bg-white/20 text-white'
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
        className={cn(
          'relative flex flex-col',
          scrollContent
            ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain'
            : 'flex min-h-0 flex-1 flex-col overflow-hidden'
        )}
      >
        {children}
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
            <LoadingSpinner size="lg" className="text-[#36606F]" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  containerClassName,
  wrapperClassName,
  panelHostClassName,
  subtitle,
  headerVariant = 'white',
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
}: ModalProps) {
  const titleId = useId();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef<number | null>(null);
  const trackedLabelRef = useRef<string | null>(null);

  const resolvedUsageLabel =
    usageLabel ??
    (typeof title === 'string' ? title : ariaLabel) ??
    usageId ??
    'Modal';
  const resolvedUsageId =
    usageId ??
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
    if (!open) return;

    const unlockScroll = lockScrollGlobal();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    return () => {
      unlockScroll();
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 flex items-center justify-center p-4 animate-in fade-in duration-200',
        stackElevated ? 'z-[110]' : zIndexClass ?? 'z-[100]',
        containerClassName
      )}
    >
      <button
        type="button"
        aria-label="Cerrar"
        className={cn(
          'absolute inset-0 touch-none overscroll-none bg-black/40 backdrop-blur-sm',
          backdropClassName
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 flex w-full max-w-sm flex-col items-center pointer-events-none',
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
            headerVariant={headerVariant}
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
            className={className}
            loading={loading}
            hideCloseButton={hideCloseButton}
          >
            {children}
          </ModalPanelShell>
        </div>
      </div>
    </div>,
    document.body
  );
}
