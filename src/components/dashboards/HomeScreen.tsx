'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
    HOME_SCREEN_COMPONENT_ID,
    resolveHomeWidgetScheme,
    type HomeScreenLayout,
    type HomeScreenSlotSize,
} from '@/lib/design-system/home-screen';

export type HomeScreenProps = {
    children: ReactNode;
    className?: string;
    layout?: HomeScreenLayout;
};

export type HomeScreenSlotProps = {
    size: HomeScreenSlotSize;
    instance?: string;
    /**
     * Nombre bajo el hueco. Si no va, el widget tiene la altura de icono + nombre.
     */
    label?: string;
    /**
     * Ancla el hueco a una columna (1–4).
     */
    column?: 1 | 2 | 3 | 4;
    children: ReactNode;
    className?: string;
};

function wallpaperColor(): string {
    const fromToken = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-envolvente')
        .trim();
    return fromToken || getComputedStyle(document.body).backgroundColor;
}

/**
 * Página de inicio. 4 columnas, hasta 6 filas. La pista es el icono.
 * Con `label`, el nombre vive bajo el hueco. Sin `label`, el widget mide icono + nombre.
 */
export function HomeScreen({ children, className, layout }: HomeScreenProps) {
    const rootRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const node = rootRef.current;
        if (!node) return;
        const apply = () => {
            node.setAttribute('data-widget-scheme', resolveHomeWidgetScheme(wallpaperColor()));
        };
        apply();
    }, []);

    return (
        <div
            ref={rootRef}
            data-component={HOME_SCREEN_COMPONENT_ID}
            data-layout={layout}
            data-widget-scheme="light"
            className={cn(className)}
        >
            {children}
        </div>
    );
}

export function HomeScreenSlot({ size, instance, label, column, children, className }: HomeScreenSlotProps) {
    const isIcon = size === 'icon';
    return (
        <div
            data-element="slot"
            data-slot={size}
            data-instance={instance}
            data-named={label ? 'true' : undefined}
            data-column={column ? String(column) : undefined}
            className={cn(className)}
        >
            {isIcon ? children : (
                <div data-element="body">
                    {children}
                </div>
            )}
            {label ? <span data-element="name">{label}</span> : null}
        </div>
    );
}

export default HomeScreen;
