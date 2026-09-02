'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    DASHBOARD_SHORTCUT_COMPONENT_ID,
    resolveDashboardShortcutVariant,
    type DashboardShortcutVariant,
} from '@/lib/design-system';
import { withAppIconRev } from '@/lib/app-icons';

export type { DashboardShortcutVariant };

export type DashboardShortcutProps = {
    /**
     * Identidad estable de negocio (p. ej. `asistencia`).
     * Independiente del label visible. Obligatoria.
     */
    instance: string;
    /** Variante estructural. Default: icono en squircle, nombre debajo. */
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
    /**
     * Relleno del recuadro. `true`: el gráfico no puede ser la forma, va sobre fondo (Caja).
     * `false`: el gráfico se adapta a la forma (Recetas).
     * Si no se pasa: fondo si no hay `img` (Lucide o cifra).
     */
    plate?: boolean;
};

/**
 * Primer componente oficial del Design System de pantalla.
 *
 * Anatomía:
 *   host
 *   ├── iconWrap
 *   │   ├── iconBox (`data-element="iconBox"`, `data-studio-target="bg"`)
 *   │   │   └── asset (`data-element="asset"`, `data-studio-target="asset"`)
 *   │   ├── rim (`data-element="rim"`)
 *   │   └── badge
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
    variant = 'icon-card-text-outside',
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
    plate: plateProp,
}: DashboardShortcutProps) {
    const composition = resolveDashboardShortcutVariant(variant);
    const showBadge = typeof badgeCount === 'number' && badgeCount > 0;
    const badgeLabel = showBadge ? (badgeCount > 99 ? '99+' : String(badgeCount)) : null;
    const plate = plateProp ?? !img;
    const ios = variant === 'icon-card-text-outside';
    const shortcutFill =
        ios && plate
            ? iconColor?.includes('emerald') || contentClassName?.includes('emerald')
                ? 'var(--color-positivo)'
                : 'var(--color-superficie)'
            : undefined;

    const hostCard =
        composition.hostSurface === 'card'
            ? 'bg-ds-superficie shadow-ds-superficie border border-ds-borde'
            : 'bg-transparent shadow-none border-transparent';

    const iconBoxCard =
        composition.iconBoxSurface === 'card'
            ? 'bg-ds-superficie shadow-ds-superficie border border-ds-borde rounded-ds-superficie p-ds-2'
            : '';

    const asset = children ?? (
        img ? (
            <img
                src={withAppIconRev(img)}
                alt=""
                width={96}
                height={96}
                draggable={false}
                className={
                    ios
                        ? plate
                            ? 'object-contain'
                            : 'h-full w-full object-cover'
                        : 'h-auto w-auto max-h-full max-w-full object-contain'
                }
            />
        ) : Icon ? (
            <div
                className={cn(
                    ios
                        ? 'flex h-full w-full items-center justify-center'
                        : cn(
                              'flex h-12 w-12 items-center justify-center rounded-ds-control shadow-ds-superficie md:h-11 md:w-11',
                              iconColor,
                              !iconClassName && 'text-white'
                          )
                )}
            >
                <Icon
                    size={ios ? 32 : 28}
                    strokeWidth={2.5}
                    className={cn(
                        ios ? 'h-8 w-8' : 'h-6 w-6 md:h-7 md:w-7',
                        iconClassName,
                    )}
                />
            </div>
        ) : null
    );

    return (
        <button
            type="button"
            onClick={onClick}
            data-component={DASHBOARD_SHORTCUT_COMPONENT_ID}
            data-variant={variant}
            data-instance={instance}
            data-plate={ios ? (plate ? 'fill' : 'bleed') : undefined}
            className={cn(
                'relative flex flex-col items-center justify-center gap-ds-1 p-ds-2 transition-all group active:scale-95 touch-manipulation',
                ios
                    ? 'w-full min-w-0 min-h-ds-tactil p-0'
                    : cn(
                          'w-full aspect-square min-w-0 min-h-ds-tactil rounded-ds-superficie',
                          'md:aspect-auto md:w-[4.75rem] md:max-w-full md:p-1.5 md:gap-0.5 md:rounded-ds-control',
                          hostCard
                      ),
                className
            )}
            style={
                shortcutFill
                    ? { ['--shortcut-fill' as string]: shortcutFill }
                    : undefined
            }
        >
            {composition.showIcon ? (
                <div data-element="iconWrap" className={ios ? undefined : 'contents'}>
                    <div
                        data-element="iconBox"
                        data-studio-target="bg"
                        {...(composition.iconBoxMode !== 'none'
                            ? { 'data-studio-icon-box': composition.iconBoxMode }
                            : {})}
                        className={cn(
                            ios
                                ? 'relative'
                                : cn(
                                      'flex-1 flex items-center justify-center w-full min-h-0 min-w-0 md:flex-none md:h-11 md:w-11',
                                      iconBoxCard
                                  ),
                            !ios && contentClassName
                        )}
                    >
                        <div
                            data-element="asset"
                            data-studio-target="asset"
                            className={
                                ios
                                    ? undefined
                                    : 'w-full h-full flex items-center justify-center'
                            }
                        >
                            {ios ? (
                                asset
                            ) : (
                                <div className="w-12 h-12 md:w-11 md:h-11 flex items-center justify-center transition-transform group-hover:scale-110 overflow-hidden shrink-0">
                                    {asset}
                                </div>
                            )}
                        </div>
                    </div>
                    {ios ? <span data-element="rim" aria-hidden /> : null}
                    {showBadge ? (
                        <span
                            className="absolute -top-1 -right-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black leading-none text-white shadow-sm ring-2 ring-ds-superficie"
                            aria-label={`${badgeCount} pendientes`}
                        >
                            {badgeLabel}
                        </span>
                    ) : null}
                </div>
            ) : showBadge ? (
                <span
                    className="absolute -top-1 -right-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black leading-none text-white shadow-sm ring-2 ring-ds-superficie"
                    aria-label={`${badgeCount} pendientes`}
                >
                    {badgeLabel}
                </span>
            ) : null}

            {composition.showText ? (
                <span
                    data-element="text"
                    data-studio-target="text"
                    className={cn(
                        ios
                            ? undefined
                            : 'text-[9px] md:text-[8px] font-black text-ds-texto-fuerte text-center line-clamp-2 leading-tight px-0.5 shrink-0',
                        labelClassName
                    )}
                >
                    {label}
                </span>
            ) : null}
        </button>
    );
}
