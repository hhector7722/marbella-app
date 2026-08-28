'use client';

import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    DASHBOARD_SHORTCUT_COMPONENT_ID,
    resolveDashboardShortcutVariant,
    type DashboardShortcutVariant,
} from '@/lib/design-system';

export type { DashboardShortcutVariant };

export type DashboardShortcutProps = {
    /**
     * Identidad estable de negocio (p. ej. `asistencia`).
     * Independiente del label visible. Obligatoria.
     */
    instance: string;
    /** Variante estructural. Default: `icon-text` (card con icono + texto). */
    variant?: DashboardShortcutVariant;
    label: string;
    onClick?: () => void;
    img?: string;
    icon?: LucideIcon;
    iconColor?: string;
    iconClassName?: string;
    className?: string;
    labelClassName?: string;
    contentClassName?: string;
    badgeCount?: number;
    children?: React.ReactNode;
};

/**
 * Primer componente oficial del Design System de pantalla.
 *
 * Anatomía:
 *   host
 *   ├── iconBox (`data-element="iconBox"`, `data-studio-target="bg"`)
 *   │   └── asset (`data-element="asset"`, `data-studio-target="asset"`)
 *   └── text (`data-element="text"`, `data-studio-target="text"`)
 *
 * Identidad (producción + preparación Studio):
 *   data-component="DashboardShortcut"
 *   data-variant="<variant>"
 *   data-instance="<business-id>"
 *
 * `data-studio-target` se conserva para compatibilidad con el Studio actual.
 */
export default function DashboardShortcut({
    instance,
    variant = 'icon-text',
    label,
    onClick,
    img,
    icon: Icon,
    iconColor = 'bg-ds-superficie',
    iconClassName,
    className,
    labelClassName,
    contentClassName,
    badgeCount,
    children,
}: DashboardShortcutProps) {
    const composition = resolveDashboardShortcutVariant(variant);
    const showBadge = typeof badgeCount === 'number' && badgeCount > 0;
    const badgeLabel = showBadge ? (badgeCount > 99 ? '99+' : String(badgeCount)) : null;

    const hostCard =
        composition.hostSurface === 'card'
            ? 'bg-ds-superficie shadow-ds-superficie border border-ds-borde'
            : 'bg-transparent shadow-none border-transparent';

    const iconBoxCard =
        composition.iconBoxSurface === 'card'
            ? 'bg-ds-superficie shadow-ds-superficie border border-ds-borde rounded-ds-superficie p-ds-2'
            : '';

    return (
        <button
            type="button"
            onClick={onClick}
            data-component={DASHBOARD_SHORTCUT_COMPONENT_ID}
            data-variant={variant}
            data-instance={instance}
            className={cn(
                'relative flex flex-col items-center justify-center gap-ds-1 p-ds-2 transition-all group active:scale-95 touch-manipulation',
                'w-full aspect-square min-w-0 min-h-ds-tactil rounded-ds-superficie',
                'md:aspect-auto md:w-[4.75rem] md:max-w-full md:p-1.5 md:gap-0.5 md:rounded-ds-control',
                hostCard,
                className
            )}
        >
            {showBadge ? (
                <span
                    className="absolute -top-1 -right-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black leading-none text-white shadow-sm ring-2 ring-ds-superficie"
                    aria-label={`${badgeCount} pendientes`}
                >
                    {badgeLabel}
                </span>
            ) : null}

            {composition.showIcon ? (
                <div
                    data-element="iconBox"
                    data-studio-target="bg"
                    {...(composition.iconBoxMode !== 'none'
                        ? { 'data-studio-icon-box': composition.iconBoxMode }
                        : {})}
                    className={cn(
                        'flex-1 flex items-center justify-center w-full min-h-0 min-w-0 md:flex-none md:h-11 md:w-11',
                        iconBoxCard,
                        contentClassName
                    )}
                >
                    <div
                        data-element="asset"
                        data-studio-target="asset"
                        className="w-full h-full flex items-center justify-center"
                    >
                        {children ?? (
                            <div className="w-12 h-12 md:w-11 md:h-11 flex items-center justify-center transition-transform group-hover:scale-110 overflow-hidden shrink-0">
                                {img ? (
                                    <Image
                                        src={img}
                                        alt={label}
                                        width={48}
                                        height={48}
                                        className="w-full h-full object-contain"
                                    />
                                ) : Icon ? (
                                    <div
                                        className={cn(
                                            'w-12 h-12 md:w-11 md:h-11 rounded-ds-control flex items-center justify-center shadow-ds-superficie',
                                            iconColor,
                                            !iconClassName && 'text-white'
                                        )}
                                    >
                                        <Icon
                                            size={28}
                                            strokeWidth={2.5}
                                            className={cn('w-6 h-6 md:w-7 md:h-7', iconClassName)}
                                        />
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                </div>
            ) : null}

            {composition.showText ? (
                <span
                    data-element="text"
                    data-studio-target="text"
                    className={cn(
                        'text-[9px] md:text-[8px] font-black text-ds-texto-fuerte text-center line-clamp-2 leading-tight px-0.5 shrink-0',
                        labelClassName
                    )}
                >
                    {label}
                </span>
            ) : null}
        </button>
    );
}
